import React, { useState, useEffect } from 'react';
import { AlertCircle, Search, SlidersHorizontal, RefreshCw, X } from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';
import { ProductCard } from '../components/ProductCard';
import { BackButton } from '../components/BackButton';

interface CatalogPageProps {
  initialCategory: string;
  onNavigate: (view: string) => void;
  onSelectProduct: (productId: string) => void;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ initialCategory, onNavigate, onSelectProduct }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchProducts = async (
    search = searchTerm,
    page = currentPage,
    category = selectedCategory,
    sort = sortBy,
  ) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.getProducts({
          search: search || undefined,
          category: category === 'All' ? undefined : category,
          sort,
          page,
          limit: 24,
        }),
        api.getCategories(),
      ]);

      setProducts(prodRes.data);
      setTotalProducts(prodRes.total);
      setTotalPages(prodRes.totalPages);
      setCategories(catRes.data);
    } catch (err) {
      console.error('Failed to fetch catalog', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load products right now.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchProducts(searchTerm, 1);
  }, [selectedCategory, sortBy, currentPage]);

  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts();
  };

  const handleResetFilters = () => {
    setSelectedCategory('All');
    setSearchTerm('');
    setSortBy('newest');
    setCurrentPage(1);
    fetchProducts('', 1, 'All', 'newest');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
      {/* Page Title & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">AURA collection</span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Explore All Products
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Shop {totalProducts} products across our latest collections
          </p>
        </div>

        {errorMessage && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorMessage}
          </div>
        )}
        {!isLoading && totalPages > 1 && (
          <nav aria-label="Product pages" className="flex items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600" aria-live="polite">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}

        {/* Search Form */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Search skincare, garden tools, home essentials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs bg-white border border-slate-300 rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
                fetchProducts('');
              }}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Category Segmented Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 text-xs font-medium scrollbar-none">
          <button
            onClick={() => {
              setSelectedCategory('All');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-slate-900 text-white font-semibold'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => {
                setSelectedCategory(cat.name);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat.name
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{cat.name}</span>
              <span className="ml-1.5 text-[11px] opacity-70 font-mono">({cat.count})</span>
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setCurrentPage(1);
            }}
            className="text-xs font-medium bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none"
          >
            <option value="newest">Newest Arrivals</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="rating">Customer Rating</option>
          </select>
        </div>
      </div>

      {/* Product Grid or Empty State */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3 text-slate-600" />
          <p className="text-xs font-medium">Loading products...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No matching products found</h3>
          <p className="text-xs text-slate-500">
            No items matched your current filter criteria. Try searching for a different term or clearing filters.
          </p>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={(id) => onSelectProduct(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
