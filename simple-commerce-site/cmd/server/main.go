package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"simple-commerce-site/internal/app"
	"simple-commerce-site/internal/store"
)

func main() {
	addr := getenv("ADDR", ":8080")

	memStore := store.NewMemoryStore()
	server := app.New(memStore)

	srv := &http.Server{
		Addr:              addr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("simple commerce site listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

