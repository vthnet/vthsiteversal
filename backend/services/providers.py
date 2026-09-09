"""Provider adapters with bounded async I/O and normalized catalog/order contracts."""
from __future__ import annotations

import asyncio, json, time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin
import httpx
from services import settings as settings_service

class RawProduct(dict): pass

class ProviderAdapter(ABC):
    key: str
    mode: str = "live"
    @abstractmethod
    async def fetch_products(self, category_id: str) -> List[RawProduct]: ...
    async def create_purchase(self, product: Dict[str, Any], order_id: str) -> Dict[str, Any]:
        return {"status":"provider_not_configured","reference":None,"message":"Supplier purchase adapter is not configured."}
    async def get_order_status(self, reference: str) -> Dict[str, Any]: return {"status":"unknown","reference":reference}
    async def cancel_order(self, reference: str) -> Dict[str, Any]: return {"status":"cancelled","reference":reference}
    async def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        base, key = config.get("api_base_url") or "", config.get("api_key") or ""
        if not base or not key: return {"status":"not_configured","detail":"API base URL and key required"}
        try:
            async with httpx.AsyncClient(timeout=min(float(config.get("timeout_seconds") or 6), 10), follow_redirects=True) as c:
                r=await c.get(base, headers=_headers(config))
            return {"status":"online" if r.status_code < 500 else "error", "detail":f"HTTP {r.status_code}"}
        except httpx.HTTPError as e: return {"status":"error","detail":e.__class__.__name__}

def _headers(config: Dict[str,Any]) -> Dict[str,str]:
    key=str(config.get("api_key") or "")
    style=str(config.get("auth_style") or "bearer").lower()
    if not key: return {"Accept":"application/json"}
    if style == "x-api-key": return {"Accept":"application/json","X-API-Key":key}
    if style == "query": return {"Accept":"application/json"}
    return {"Accept":"application/json","Authorization":f"Bearer {key}"}

def _p(category_id, code, name, flag, cost, stock, product_name, details, popular=False):
    return RawProduct(id=f"{category_id}-{code.lower()}",category_id=category_id,country_code=code,country_name=name,flag=flag,cost=float(cost),stock=int(stock),product_name=product_name,details=details,popular=popular)

class UnconfiguredProviderAdapter(ProviderAdapter):
    mode="unavailable"
    def __init__(self,key): self.key=key
    async def fetch_products(self,category_id): return []

class GenericHttpProviderAdapter(ProviderAdapter):
    def __init__(self,key,config): self.key,self.config=key,config; self.mode="live"
    def _url(self,path): return urljoin(self.config["api_base_url"].rstrip("/")+"/", str(path).lstrip("/"))
    async def _request(self,method,path,**kwargs):
        timeout=min(float(self.config.get("timeout_seconds") or 6),15)
        headers={**_headers(self.config),**kwargs.pop("headers",{})}
        # Some providers require API keys as query params. This is configurable and never exposed to clients.
        params=dict(kwargs.pop("params",{}))
        if str(self.config.get("auth_style") or "").lower()=="query": params["api_key"]=self.config.get("api_key")
        async with httpx.AsyncClient(timeout=timeout,follow_redirects=True) as c:
            r=await c.request(method,self._url(path),headers=headers,params=params,**kwargs)
            if r.status_code >= 400: raise RuntimeError(f"provider_http_{r.status_code}")
            try: return r.json()
            except json.JSONDecodeError: return {"raw":r.text}
    @staticmethod
    def _items(data):
        if isinstance(data,list): return data
        if not isinstance(data,dict): return []
        for k in ("products","items","data","results","countries","numbers"):
            v=data.get(k)
            if isinstance(v,list): return v
            if isinstance(v,dict):
                for kk in ("items","products","countries","results"): 
                    if isinstance(v.get(kk),list): return v[kk]
        return []
    def _normalize(self,category_id,item):
        if not isinstance(item,dict): return None
        code=str(item.get("country_code") or item.get("country") or item.get("countryCode") or item.get("code") or "").upper()
        name=str(item.get("country_name") or item.get("countryName") or item.get("name") or code)
        if not code: return None
        price=item.get("cost",item.get("price",item.get("amount",0)))
        stock=item.get("stock",item.get("available",item.get("quantity",0)))
        try: price=float(price)
        except: price=0
        try: stock=int(stock)
        except: stock=0
        flag=str(item.get("flag") or "🌐")
        return _p(category_id,code,name,flag,price,stock,str(item.get("product_name") or item.get("product") or item.get("title") or "Digital Service"),[str(x) for x in (item.get("details") or [])] if isinstance(item.get("details"),list) else [],bool(item.get("popular")))
    async def fetch_products(self,category_id):
        data=await self._request("GET",self.config.get("products_path") or "/products",params={"category":category_id,"page":1,"per_page":100})
        return [p for x in self._items(data) if (p:=self._normalize(category_id,x)) is not None]
    async def create_purchase(self,product,order_id):
        data=await self._request("POST",self.config.get("purchase_path") or "/orders",json={"product_id":product["id"],"country":product["country_code"],"order_id":order_id})
        ref=(data.get("reference") or data.get("order_id") or data.get("id") or (data.get("data") or {}).get("id")) if isinstance(data,dict) else None
        status=str((data.get("status") if isinstance(data,dict) else "processing") or "processing").lower()
        return {"status":"ok" if ref else "failed","reference":str(ref) if ref else None,"message":str(data.get("message") or "Supplier order created") if isinstance(data,dict) else "Supplier order created","raw_status":status}
    async def get_order_status(self,reference):
        data=await self._request("GET",str(self.config.get("status_path") or "/orders/{reference}").replace("{reference}",reference))
        status=str(data.get("status") or data.get("state") or "unknown").lower() if isinstance(data,dict) else "unknown"
        return {"status":status,"reference":reference,"data":data}
    async def cancel_order(self,reference):
        data=await self._request("POST",str(self.config.get("cancel_path") or "/orders/{reference}/cancel").replace("{reference}",reference))
        return {"status":"cancelled","reference":reference,"data":data}

class TGLionAdapter(ProviderAdapter):
    """TG-Lion adapter for the documented action-based API.

    Docs expose country inventory through available_countries/country_info and
    reservations through getNumber. Authentication is apiKey + YourID.
    """
    def __init__(self, key, config):
        self.key, self.config = key, config
        self.mode = "live"

    def _params(self, action, **extra):
        params = {"action": action, "apiKey": self.config.get("api_key", ""), "YourID": self.config.get("provider_id", "")}
        params.update({k: v for k, v in extra.items() if v is not None and v != ""})
        return params

    async def _request(self, action, **params):
        timeout = min(float(self.config.get("timeout_seconds") or 6), 15)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as c:
            r = await c.get(self.config["api_base_url"], params=self._params(action, **params), headers={"Accept":"application/json"})
            if r.status_code >= 400:
                raise RuntimeError(f"tg_lion_http_{r.status_code}")
            try:
                return r.json()
            except json.JSONDecodeError:
                return {"raw": r.text}

    async def fetch_products(self, category_id):
        data = await self._request("available_countries")
        countries = data.get("countries", {}) if isinstance(data, dict) else {}
        items = []
        if isinstance(countries, dict):
            for code, item in countries.items():
                if not isinstance(item, dict):
                    continue
                code_u = str(item.get("code") or code).upper()
                try: cost = float(item.get("price", 0))
                except (TypeError, ValueError): cost = 0.0
                try: stock = int(item.get("qty", 0))
                except (TypeError, ValueError): stock = 0
                items.append(_p(category_id, code_u, str(item.get("name") or code_u), "🌐", cost, stock, "Telegram Account — TG-Lion", ["TG-Lion supplier", "SMS/OTP delivery"], stock > 0))
        return items

    async def create_purchase(self, product, order_id):
        data = await self._request("getNumber", country_code=product["country_code"], maxPrice=product.get("cost"))
        if not isinstance(data, dict) or str(data.get("status", "")).lower() != "ok" or not data.get("Number"):
            return {"status":"failed","reference":None,"message":str((data or {}).get("message") or "TG-Lion did not return a number")[:200]}
        number = str(data["Number"])
        # getCode is intentionally polled later by the order sync worker.
        return {"status":"ok","reference":number,"message":"TG-Lion number reserved; waiting for Telegram code.","delivery":number,"supplier_number":number,"supplier_price":data.get("price")}

    async def get_order_status(self, reference):
        data = await self._request("getCode", number=reference)
        if isinstance(data, dict) and str(data.get("status", "")).lower() == "ok" and data.get("code"):
            return {"status":"completed","reference":reference,"otp":str(data.get("code")),"password":data.get("pass"),"data":data}
        return {"status":"awaiting_otp","reference":reference,"data":data}

    async def cancel_order(self, reference):
        return {"status":"cancelled","reference":reference,"message":"TG-Lion documentation does not expose a cancellation action."}

    async def test_connection(self, config):
        if not config.get("api_base_url") or not config.get("api_key") or not config.get("provider_id"):
            return {"status":"not_configured","detail":"API base URL, API key and YourID required"}
        try:
            data = await self._request("get_balance")
            ok = isinstance(data, dict) and str(data.get("status", "")).lower() == "ok"
            return {"status":"online" if ok else "error","detail":str(data.get("balance") or data.get("message") or "TG-Lion response")[:200]}
        except Exception as e:
            return {"status":"error","detail":e.__class__.__name__}

class TemporaSMSAdapter(GenericHttpProviderAdapter):
    """TemporaSMS handler_api compatibility adapter."""
    async def fetch_products(self,category_id):
        service="tg" if category_id=="number-change" else "wa"
        # TemporaSMS commonly exposes getPrices/getCountries on handler_api.php.
        data=await self._request("GET",self.config["api_base_url"],params={"action":"getPrices","service":service})
        items=[]
        if isinstance(data,dict):
            source=data.get("prices") or data.get("countries") or data.get("data") or data
            if isinstance(source,dict):
                for code,val in source.items():
                    if isinstance(val,dict):
                        cost=val.get("cost",val.get("price",val.get("1",0))); stock=val.get("count",val.get("stock",0)); name=val.get("name",code)
                    else: cost=val; stock=0; name=code
                    try: cost=float(cost)
                    except: cost=0
                    items.append(_p(category_id,str(code).upper(),str(name),"🌐",cost,int(stock or 0),"Telegram Number Change" if service=="tg" else "WhatsApp Number",["OTP reservation"]))
        return items
    async def create_purchase(self,product,order_id):
        service="tg" if product["category_id"]=="number-change" else "wa"
        data=await self._request("GET",self.config["api_base_url"],params={"action":"getNumber","service":service,"country":product["country_code"]})
        raw=data.get("raw") if isinstance(data,dict) else None
        text=raw or (data.get("response") if isinstance(data,dict) else "")
        if isinstance(text,str) and text.startswith("ACCESS_NUMBER:"):
            _,ref,number=text.split(":",2)
            return {"status":"ok","reference":ref,"message":"Number reserved","delivery":number}
        ref=(data.get("id") or data.get("activation_id") or data.get("reference")) if isinstance(data,dict) else None
        return {"status":"ok" if ref else "failed","reference":str(ref) if ref else None,"message":"Number reserved" if ref else "Supplier did not return an activation"}
    async def get_order_status(self,reference):
        data=await self._request("GET",self.config["api_base_url"],params={"action":"getStatus","id":reference})
        text=data.get("raw") if isinstance(data,dict) else ""
        if isinstance(text,str) and text.startswith("STATUS_OK:"): return {"status":"completed","reference":reference,"otp":text.split(":",1)[1]}
        if isinstance(text,str) and text in ("STATUS_WAIT_CODE","STATUS_WAIT_RETRY"): return {"status":"awaiting_otp","reference":reference}
        if isinstance(text,str) and text.startswith("STATUS_CANCEL"): return {"status":"cancelled","reference":reference}
        return {"status":"unknown","reference":reference,"data":data}
    async def cancel_order(self,reference):
        data=await self._request("GET",self.config["api_base_url"],params={"action":"setStatus","id":reference,"status":8})
        return {"status":"cancelled","reference":reference,"data":data}

_cache: Dict[str,tuple[float,List[RawProduct]]]={}
CACHE_TTL_SECONDS=30

async def get_adapter(provider_key):
    config=await settings_service.get_section(provider_key)
    if config.get("enabled") and config.get("api_base_url") and config.get("api_key"):
        cls=(TGLionAdapter if provider_key=="provider_telegram_1" else TemporaSMSAdapter if provider_key=="provider_numbers" else GenericHttpProviderAdapter)
        return cls(provider_key,config),config
    return UnconfiguredProviderAdapter(provider_key),config

async def fetch_products_safe(provider_key,category_id,force=False):
    adapter,config=await get_adapter(provider_key); key=f"{provider_key}:{category_id}"; cached=_cache.get(key)
    if cached and not force and time.time()-cached[0]<CACHE_TTL_SECONDS: return cached[1],config,None
    if adapter.mode=="unavailable": return [],config,"provider_not_configured"
    retries=min(max(0,int(config.get("retries") or 0)),15); error=None
    for attempt in range(retries+1):
        try:
            products=await asyncio.wait_for(adapter.fetch_products(category_id),timeout=min(float(config.get("timeout_seconds") or 6),15)); _cache[key]=(time.time(),products); return products,config,None
        except asyncio.TimeoutError: error="timeout"
        except Exception as exc: error=str(exc)[:120] or exc.__class__.__name__
        if attempt<retries: await asyncio.sleep(min(1.5*(attempt+1),3.0))
    return (cached[1],config,error) if cached else ([],config,error)

def invalidate_cache(): _cache.clear()
