package web

import (
	"embed"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"
)

//go:embed templates static
var embedded embed.FS

type Renderer struct {
	templates *template.Template
	staticFS  fs.FS
}

func NewRenderer() (*Renderer, error) {
	funcs := template.FuncMap{
		"money": formatMoney,
		"date":  formatDate,
		"join":  strings.Join,
	}

	tmpl, err := template.New("base").Funcs(funcs).ParseFS(
		embedded,
		"templates/base.html",
		"templates/storefront/*.html",
		"templates/admin/*.html",
	)
	if err != nil {
		return nil, err
	}

	sub, err := fs.Sub(embedded, "static")
	if err != nil {
		return nil, err
	}

	return &Renderer{
		templates: tmpl,
		staticFS:  sub,
	}, nil
}

func (r *Renderer) Render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := r.templates.ExecuteTemplate(w, name, data); err != nil {
		http.Error(w, fmt.Sprintf("template render failed: %v", err), http.StatusInternalServerError)
	}
}

func (r *Renderer) ServeStatic(w http.ResponseWriter, req *http.Request) {
	file := strings.TrimPrefix(req.URL.Path, "/static/")
	file = path.Clean("/" + file)
	file = strings.TrimPrefix(file, "/")
	if file == "" || file == "." {
		file = "app.css"
	}
	http.ServeFileFS(w, req, r.staticFS, file)
}

func formatMoney(cents int) string {
	return fmt.Sprintf("¥%.2f", float64(cents)/100)
}

func formatDate(t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	return t.Format("2006-01-02 15:04")
}
