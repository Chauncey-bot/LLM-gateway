package app

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"simple-commerce-site/internal/model"
	"simple-commerce-site/internal/store"
	"simple-commerce-site/internal/web"
)

type App struct {
	store    *store.MemoryStore
	renderer *web.Renderer
}

func New(s *store.MemoryStore) *App {
	renderer, err := web.NewRenderer()
	if err != nil {
		panic(err)
	}

	return &App{
		store:    s,
		renderer: renderer,
	}
}

func (a *App) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/static/", a.renderer.ServeStatic)
	mux.HandleFunc("/api/", a.handleAPI)
	mux.HandleFunc("/admin", a.redirectAdmin)
	mux.HandleFunc("/admin/", a.handleAdmin)
	mux.HandleFunc("/", a.handleStorefront)
	return mux
}

type BaseData struct {
	Title   string
	Section string
	Active  string
}

type storefrontPageData struct {
	BaseData
	Brand      string
	Products   []model.Product
	Product    model.Product
	Related    []model.Product
	Categories []string
	Cart       []cartLineView
	Subtotal   int
	Shipping   int
	Total      int
	Order      model.Order
	Message    string
}

type adminPageData struct {
	BaseData
	Stats   model.DashboardStats
	Products []model.Product
	Orders   []model.Order
	Message string
}

type cartLineView struct {
	Product   model.Product
	Quantity  int
	LineTotal int
}

func (a *App) redirectAdmin(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/admin/", http.StatusFound)
}

func (a *App) handleStorefront(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/" && r.Method == http.MethodGet:
		a.home(w, r)
	case r.URL.Path == "/catalog" && r.Method == http.MethodGet:
		a.catalog(w, r)
	case strings.HasPrefix(r.URL.Path, "/product/") && r.Method == http.MethodGet:
		a.productDetail(w, r)
	case r.URL.Path == "/cart" && r.Method == http.MethodGet:
		a.cart(w, r)
	case r.URL.Path == "/cart/add" && r.Method == http.MethodPost:
		a.cartAdd(w, r)
	case r.URL.Path == "/checkout" && r.Method == http.MethodPost:
		a.checkout(w, r)
	case strings.HasPrefix(r.URL.Path, "/thank-you/") && r.Method == http.MethodGet:
		a.thankYou(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (a *App) handleAdmin(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/admin/" && r.Method == http.MethodGet:
		a.adminDashboard(w, r)
	case r.URL.Path == "/admin/products" && r.Method == http.MethodGet:
		a.adminProducts(w, r)
	case r.URL.Path == "/admin/products" && r.Method == http.MethodPost:
		a.adminCreateProduct(w, r)
	case r.URL.Path == "/admin/orders" && r.Method == http.MethodGet:
		a.adminOrders(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (a *App) handleAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	switch {
	case r.URL.Path == "/api/products" && r.Method == http.MethodGet:
		a.writeJSON(w, http.StatusOK, map[string]any{"items": a.store.ListProducts()})
	case r.URL.Path == "/api/orders" && r.Method == http.MethodGet:
		a.writeJSON(w, http.StatusOK, map[string]any{"items": a.store.ListOrders()})
	case r.URL.Path == "/api/stats" && r.Method == http.MethodGet:
		a.writeJSON(w, http.StatusOK, map[string]any{"items": a.store.Stats()})
	default:
		http.NotFound(w, r)
	}
}

func (a *App) home(w http.ResponseWriter, r *http.Request) {
	data := storefrontPageData{
		BaseData: BaseData{
			Title:   "首页",
			Section: "storefront",
			Active:  "home",
		},
		Brand:      "Simple Commerce",
		Products:   a.store.FeaturedProducts(3),
		Categories: a.store.ListCategories(),
	}
	a.renderer.Render(w, "base", data)
}

func (a *App) catalog(w http.ResponseWriter, r *http.Request) {
	data := storefrontPageData{
		BaseData: BaseData{
			Title:   "商品列表",
			Section: "storefront",
			Active:  "catalog",
		},
		Products:   a.store.ListProducts(),
		Categories: a.store.ListCategories(),
	}
	a.renderer.Render(w, "base", data)
}

func (a *App) productDetail(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimPrefix(r.URL.Path, "/product/")
	product, ok := a.store.GetProductBySlug(slug)
	if !ok {
		http.NotFound(w, r)
		return
	}

	all := a.store.ListProducts()
	related := make([]model.Product, 0, 3)
	for _, item := range all {
		if item.Category == product.Category && item.ID != product.ID {
			related = append(related, item)
		}
		if len(related) == 3 {
			break
		}
	}

	data := storefrontPageData{
		BaseData: BaseData{
			Title:   product.Name,
			Section: "storefront",
			Active:  "catalog",
		},
		Product: product,
		Related: related,
	}
	a.renderer.Render(w, "base", data)
}

func (a *App) cart(w http.ResponseWriter, r *http.Request) {
	lines, subtotal := a.cartLines(r)
	data := storefrontPageData{
		BaseData: BaseData{
			Title:   "购物车",
			Section: "storefront",
			Active:  "cart",
		},
		Cart:     lines,
		Subtotal: subtotal,
		Shipping: 0,
		Total:    subtotal,
	}
	a.renderer.Render(w, "base", data)
}

func (a *App) cartAdd(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid form", http.StatusBadRequest)
		return
	}

	productID := r.FormValue("product_id")
	quantity, _ := strconv.Atoi(defaultString(r.FormValue("quantity"), "1"))
	if quantity < 1 {
		quantity = 1
	}

	product, ok := a.store.GetProductByID(productID)
	if !ok {
		http.NotFound(w, r)
		return
	}

	cart := a.readCartCookie(r)
	cart[product.ID] += quantity
	a.writeCartCookie(w, cart)

	http.Redirect(w, r, "/cart", http.StatusFound)
}

func (a *App) checkout(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid form", http.StatusBadRequest)
		return
	}

	cart := a.readCartCookie(r)
	if len(cart) == 0 {
		http.Redirect(w, r, "/cart", http.StatusFound)
		return
	}

	lines, subtotal, err := a.cartLinesFromMap(cart)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	order := model.Order{
		CustomerName: strings.TrimSpace(r.FormValue("customer_name")),
		Phone:        strings.TrimSpace(r.FormValue("phone")),
		Address:      strings.TrimSpace(r.FormValue("address")),
		Lines:        make([]model.OrderLine, 0, len(lines)),
		TotalCents:   subtotal,
		Status:       "待确认",
	}

	for _, line := range lines {
		order.Lines = append(order.Lines, model.OrderLine{
			ProductID:   line.Product.ID,
			ProductName: line.Product.Name,
			Quantity:    line.Quantity,
			UnitCents:   line.Product.PriceCents,
			LineCents:   line.LineTotal,
		})
	}

	if err := validateOrder(order); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	created := a.store.CreateOrder(order)
	a.clearCartCookie(w)
	http.Redirect(w, r, "/thank-you/"+created.Number, http.StatusFound)
}

func (a *App) thankYou(w http.ResponseWriter, r *http.Request) {
	number := strings.TrimPrefix(r.URL.Path, "/thank-you/")
	order, ok := a.findOrder(number)
	if !ok {
		http.NotFound(w, r)
		return
	}

	data := storefrontPageData{
		BaseData: BaseData{
			Title:   "下单成功",
			Section: "storefront",
			Active:  "home",
		},
		Order: order,
	}
	a.renderer.Render(w, "base", data)
}

func (a *App) adminDashboard(w http.ResponseWriter, r *http.Request) {
	data := adminPageData{
		BaseData: BaseData{
			Title:   "管理后台",
			Section: "admin",
			Active:  "dashboard",
		},
		Stats:   a.store.Stats(),
		Products: a.store.ListProducts(),
		Orders:  a.store.ListOrders(),
	}
	a.renderer.Render(w, "base", data)
}

func (a *App) adminProducts(w http.ResponseWriter, r *http.Request) {
	data := adminPageData{
		BaseData: BaseData{
			Title:   "商品管理",
			Section: "admin",
			Active:  "products",
		},
		Products: a.store.ListProducts(),
	}
	a.renderer.Render(w, "base", data)
}

func (a *App) adminOrders(w http.ResponseWriter, r *http.Request) {
	data := adminPageData{
		BaseData: BaseData{
			Title:   "订单管理",
			Section: "admin",
			Active:  "orders",
		},
		Orders: a.store.ListOrders(),
	}
	a.renderer.Render(w, "base", data)
}

func (a *App) adminCreateProduct(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid form", http.StatusBadRequest)
		return
	}

	price, _ := strconv.Atoi(defaultString(r.FormValue("price_cents"), "0"))
	stock, _ := strconv.Atoi(defaultString(r.FormValue("stock"), "0"))
	featured := r.FormValue("featured") == "on"

	product := model.Product{
		Name:        strings.TrimSpace(r.FormValue("name")),
		Slug:        slugify(r.FormValue("slug")),
		Description: strings.TrimSpace(r.FormValue("description")),
		Category:    strings.TrimSpace(r.FormValue("category")),
		ImageURL:    strings.TrimSpace(r.FormValue("image_url")),
		PriceCents:  price,
		Stock:       stock,
		Featured:    featured,
	}

	if product.ImageURL == "" {
		product.ImageURL = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80"
	}

	if _, err := a.store.CreateProduct(product); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	http.Redirect(w, r, "/admin/products", http.StatusFound)
}

func (a *App) writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (a *App) cartLines(r *http.Request) ([]cartLineView, int) {
	lines, subtotal, _ := a.cartLinesFromMap(a.readCartCookie(r))
	return lines, subtotal
}

func (a *App) cartLinesFromMap(cart map[string]int) ([]cartLineView, int, error) {
	if len(cart) == 0 {
		return nil, 0, nil
	}

	lines := make([]cartLineView, 0, len(cart))
	subtotal := 0
	for id, quantity := range cart {
		product, ok := a.store.GetProductByID(id)
		if !ok {
			continue
		}
		if quantity < 1 {
			quantity = 1
		}
		lineTotal := product.PriceCents * quantity
		subtotal += lineTotal
		lines = append(lines, cartLineView{
			Product:   product,
			Quantity:  quantity,
			LineTotal: lineTotal,
		})
	}
	return lines, subtotal, nil
}

func (a *App) findOrder(number string) (model.Order, bool) {
	for _, order := range a.store.ListOrders() {
		if order.Number == number {
			return order, true
		}
	}
	return model.Order{}, false
}

func (a *App) readCartCookie(r *http.Request) map[string]int {
	cart := map[string]int{}
	cookie, err := r.Cookie("cart")
	if err != nil || cookie.Value == "" {
		return cart
	}
	for _, pair := range strings.Split(cookie.Value, ",") {
		parts := strings.SplitN(pair, ":", 2)
		if len(parts) != 2 {
			continue
		}
		qty, err := strconv.Atoi(parts[1])
		if err != nil || qty < 1 {
			continue
		}
		cart[parts[0]] = qty
	}
	return cart
}

func (a *App) writeCartCookie(w http.ResponseWriter, cart map[string]int) {
	values := make([]string, 0, len(cart))
	for id, qty := range cart {
		values = append(values, id+":"+strconv.Itoa(qty))
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "cart",
		Value:    strings.Join(values, ","),
		Path:     "/",
		MaxAge:   60 * 60 * 24 * 7,
		SameSite: http.SameSiteLaxMode,
	})
}

func (a *App) clearCartCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "cart",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		SameSite: http.SameSiteLaxMode,
	})
}

func validateOrder(order model.Order) error {
	switch {
	case strings.TrimSpace(order.CustomerName) == "":
		return errors.New("请输入收货人姓名")
	case strings.TrimSpace(order.Phone) == "":
		return errors.New("请输入手机号")
	case strings.TrimSpace(order.Address) == "":
		return errors.New("请输入收货地址")
	case len(order.Lines) == 0:
		return errors.New("购物车为空")
	}
	return nil
}

func slugify(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	v = strings.ReplaceAll(v, " ", "-")
	v = strings.ReplaceAll(v, "_", "-")
	var b strings.Builder
	lastDash := false
	for _, r := range v {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
			lastDash = false
		case r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
