package store

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"simple-commerce-site/internal/model"
)

type MemoryStore struct {
	mu       sync.RWMutex
	products []model.Product
	orders   []model.Order
	nextPID  int
	nextOID  int
}

func NewMemoryStore() *MemoryStore {
	s := &MemoryStore{
		nextPID: 1,
		nextOID: 1,
	}

	s.products = []model.Product{
		{
			ID:          s.newProductID(),
			Name:        "极简棉质 T 恤",
			Slug:        "cotton-tee",
			Description: "轻薄透气，适合夏季日常穿搭。",
			Category:    "服饰",
			ImageURL:    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80",
			PriceCents:  12900,
			Stock:       86,
			Featured:    true,
			CreatedAt:   time.Now().Add(-72 * time.Hour),
		},
		{
			ID:          s.newProductID(),
			Name:        "便携蓝牙音箱",
			Slug:        "portable-speaker",
			Description: "小体积大音量，适合露营和居家使用。",
			Category:    "数码",
			ImageURL:    "https://images.unsplash.com/photo-1518441902111-1d1c4b2c3f0a?auto=format&fit=crop&w=1200&q=80",
			PriceCents:  29900,
			Stock:       24,
			Featured:    true,
			CreatedAt:   time.Now().Add(-48 * time.Hour),
		},
		{
			ID:          s.newProductID(),
			Name:        "香氛护手霜礼盒",
			Slug:        "hand-cream-set",
			Description: "三支装组合，适合自用或送礼。",
			Category:    "美妆",
			ImageURL:    "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1200&q=80",
			PriceCents:  9900,
			Stock:       120,
			Featured:    false,
			CreatedAt:   time.Now().Add(-24 * time.Hour),
		},
	}

	return s
}

func (s *MemoryStore) ListProducts() []model.Product {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]model.Product, len(s.products))
	copy(items, s.products)
	sort.Slice(items, func(i, j int) bool {
		if items[i].Featured != items[j].Featured {
			return items[i].Featured && !items[j].Featured
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items
}

func (s *MemoryStore) FeaturedProducts(limit int) []model.Product {
	all := s.ListProducts()
	out := make([]model.Product, 0, limit)
	for _, item := range all {
		if item.Featured {
			out = append(out, item)
		}
		if len(out) == limit {
			break
		}
	}
	return out
}

func (s *MemoryStore) ListCategories() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	set := map[string]struct{}{}
	for _, item := range s.products {
		if item.Category != "" {
			set[item.Category] = struct{}{}
		}
	}
	categories := make([]string, 0, len(set))
	for category := range set {
		categories = append(categories, category)
	}
	sort.Strings(categories)
	return categories
}

func (s *MemoryStore) GetProductBySlug(slug string) (model.Product, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, item := range s.products {
		if item.Slug == slug {
			return item, true
		}
	}
	return model.Product{}, false
}

func (s *MemoryStore) GetProductByID(id string) (model.Product, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, item := range s.products {
		if item.ID == id {
			return item, true
		}
	}
	return model.Product{}, false
}

func (s *MemoryStore) CreateProduct(p model.Product) (model.Product, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(p.Name) == "" {
		return model.Product{}, errors.New("product name is required")
	}
	if strings.TrimSpace(p.Slug) == "" {
		return model.Product{}, errors.New("product slug is required")
	}

	for _, item := range s.products {
		if item.Slug == p.Slug {
			return model.Product{}, fmt.Errorf("slug %q already exists", p.Slug)
		}
	}

	p.ID = s.newProductID()
	p.CreatedAt = time.Now()
	s.products = append([]model.Product{p}, s.products...)
	return p, nil
}

func (s *MemoryStore) ListOrders() []model.Order {
	s.mu.RLock()
	defer s.mu.RUnlock()

	items := make([]model.Order, len(s.orders))
	copy(items, s.orders)
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items
}

func (s *MemoryStore) CreateOrder(order model.Order) model.Order {
	s.mu.Lock()
	defer s.mu.Unlock()

	order.ID = s.newOrderID()
	order.Number = fmt.Sprintf("NO%06d", s.nextOID-1)
	order.CreatedAt = time.Now()
	if order.Status == "" {
		order.Status = "待确认"
	}
	s.orders = append([]model.Order{order}, s.orders...)
	return order
}

func (s *MemoryStore) UpdateOrderStatus(number, status string) (model.Order, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.orders {
		if s.orders[i].Number == number {
			s.orders[i].Status = status
			return s.orders[i], true
		}
	}
	return model.Order{}, false
}

func (s *MemoryStore) Stats() model.DashboardStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := model.DashboardStats{
		ProductCount: len(s.products),
		OrderCount:   len(s.orders),
	}
	for _, order := range s.orders {
		stats.RevenueCents += order.TotalCents
	}
	for _, product := range s.products {
		if product.Stock < 20 {
			stats.LowStock++
		}
	}
	return stats
}

func (s *MemoryStore) newProductID() string {
	id := fmt.Sprintf("P%04d", s.nextPID)
	s.nextPID++
	return id
}

func (s *MemoryStore) newOrderID() string {
	id := fmt.Sprintf("O%04d", s.nextOID)
	s.nextOID++
	return id
}
