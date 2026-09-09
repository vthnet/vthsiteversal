import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassCard, PlatformLogo, PLATFORM_BRAND, ProductRow, SearchField, SectionTitle, Skeleton, StateBlock, TopBar, VthIcon } from "@/src/components/vth-ui";
import { Category, Product, PublicSettings } from "@/src/models";
import { money, useCommonStyles } from "@/src/screens/common";
import { getProducts, getRecentProducts, markProductViewed } from "@/src/services/api";
import { makeStyles, useTheme } from "@/src/theme";

type SortMode = "popular" | "price" | "availability";

export function CatalogScreen({ category, settings, onBack, onBuy }: { category: Category; settings: PublicSettings; onBack: () => void; onBuy: (product: Product) => void }) {
  const insets = useSafeAreaInsets();
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const brand = PLATFORM_BRAND[category.platform];
  const [products, setProducts] = useState<Product[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [inStockOnly, setInStockOnly] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await getProducts(category.id, refresh);
      setProducts(result.products);
      if (result.error && result.products.length === 0) setError("Stock information is temporarily unavailable.");
    } catch {
      setError("We couldn't load countries right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    if (settings.store.feature_recent_countries) getRecentProducts().then((items) => setRecent(items.filter((p) => p.category_id === category.id))).catch(() => undefined);
  }, [category.id, settings.store.feature_recent_countries]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = products.filter((p) => (!term || `${p.country_name} ${p.country_code} ${p.product_name}`.toLowerCase().includes(term)) && (!inStockOnly || p.available));
    return [...list].sort((a, b) => sort === "price" ? a.price - b.price : sort === "availability" ? Number(b.available) - Number(a.available) || (b.stock ?? 0) - (a.stock ?? 0) : Number(b.popular) - Number(a.popular) || Number(b.available) - Number(a.available));
  }, [products, search, sort, inStockOnly]);
  const popular = useMemo(() => products.filter((p) => p.popular && p.available).slice(0, 4), [products]);

  const buy = (product: Product) => { void markProductViewed(product.id); onBuy(product); };

  return (
    <ScrollView testID="vth-catalog-screen" showsVerticalScrollIndicator={false} contentContainerStyle={[common.scrollContent, { paddingBottom: insets.bottom + 30 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brandSecondary} />}>
      <TopBar title="Choose country" subtitle={category.short_title} onBack={onBack} right={<Pressable testID="refresh-stock" onPress={() => load(true)} style={common.headerIcon}><VthIcon name="refresh" color={colors.onSurfaceSecondary} /></Pressable>} />
      <View style={styles.hero}><View style={[styles.heroIcon, { backgroundColor: `${brand.color}1F` }]}><PlatformLogo platform={category.platform} size={26} /></View><View style={styles.heroCopy}><PlatformLogo platform={category.platform} badge /><Text style={styles.heroTitle}>{category.title}</Text><Text style={styles.heroSubtitle}>{category.description}</Text></View></View>
      {category.maintenance ? <StateBlock icon="wrench" tone="warning" title="Temporarily unavailable" description={settings.store.maintenance_message} actionLabel="Check again" onAction={() => load(true)} /> : <>
        <SearchField value={search} onChangeText={setSearch} />
        <View style={common.chipRow}>{([["popular", "Popular", "star"], ["price", "Price", "sort"], ["availability", "Availability", "bolt"]] as [SortMode, string, string][]).map(([id, label, icon]) => <Pressable key={id} testID={`sort-${id}`} onPress={() => setSort(id)} style={[common.chip, sort === id && common.chipActive]}><VthIcon name={icon} size={13} color={sort === id ? colors.onBrandPrimary : colors.onSurfaceSecondary} /><Text style={[common.chipText, sort === id && common.chipTextActive]}>{label}</Text></Pressable>)}<Pressable testID="filter-instock" onPress={() => setInStockOnly((v) => !v)} style={[common.chip, inStockOnly && common.chipActive]}><VthIcon name="filter" size={13} color={inStockOnly ? colors.onBrandPrimary : colors.onSurfaceSecondary} /><Text style={[common.chipText, inStockOnly && common.chipTextActive]}>In stock</Text></Pressable></View>
        {!loading && !search && recent.length > 0 && <><SectionTitle title="Recently viewed" /><ScrollView horizontal showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>{recent.map((p) => <Pressable key={p.id} onPress={() => buy(p)} disabled={!p.available} style={({ pressed }) => [styles.recentCard, pressed && common.pressed]}><Text style={styles.recentFlag}>{p.flag}</Text><Text style={styles.recentName} numberOfLines={1}>{p.country_name}</Text><Text style={styles.recentPrice}>{money(p.price)}</Text></Pressable>)}</ScrollView></>}
        {!loading && !search && popular.length > 0 && <><SectionTitle title="Popular countries" /><View style={styles.popularGrid}>{popular.map((p) => <Pressable key={p.id} testID={`popular-${p.id}`} onPress={() => buy(p)} style={({ pressed }) => [styles.popularCard, pressed && common.pressed]}><Text style={styles.recentFlag}>{p.flag}</Text><View style={styles.popularCopy}><Text style={styles.recentName} numberOfLines={1}>{p.country_name}</Text><Text style={styles.popularMeta}>{p.stock === null ? p.stock_label : `${p.stock} left`}</Text></View><Text style={styles.recentPrice}>{money(p.price)}</Text></Pressable>)}</View></>}
        <SectionTitle title={search ? "Search results" : "All countries"} action={loading ? undefined : `${filtered.length} ${filtered.length === 1 ? "country" : "countries"}`} />
        <View style={styles.list}>
          {loading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} />) : error ? <StateBlock icon="alert" tone="error" title="Something went wrong" description={error} actionLabel="Try again" onAction={() => load(true)} /> : filtered.length ? filtered.map((product) => <ProductRow key={product.id} product={product} onBuy={() => buy(product)} />) : <StateBlock icon="search" title="No countries found" description={search ? "Try a different search term." : "New countries are added regularly. Check back soon."} />}
        </View>
        <GlassCard style={styles.note}><View style={common.row}><VthIcon name="info" size={16} color={colors.muted} /><Text style={common.muted}>Prices and stock update in real time and are confirmed server-side at checkout.</Text></View></GlassCard>
      </>}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, alignItems: "flex-start", gap: 5 },
  heroTitle: { color: colors.onSurface, fontSize: 17, lineHeight: 21, fontWeight: "800" },
  heroSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  recentRow: { gap: 8, paddingBottom: 2 },
  recentCard: { width: 108, padding: 11, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, gap: 6 },
  recentFlag: { fontSize: 22 },
  recentName: { color: colors.onSurface, fontSize: 12, fontWeight: "800" },
  recentPrice: { color: colors.brandSecondary, fontSize: 12, fontWeight: "800" },
  popularGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  popularCard: { width: "48.5%", minHeight: 58, padding: 10, borderRadius: 15, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.brandTertiary, flexDirection: "row", alignItems: "center", gap: 8 },
  popularCopy: { flex: 1 },
  popularMeta: { color: colors.muted, fontSize: 9, marginTop: 2 },
  list: { minHeight: 120 },
  note: { padding: 12 },
}));
