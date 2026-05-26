package model

import "time"

type Product struct {
	ID          string
	Name        string
	Slug        string
	Description string
	Category    string
	ImageURL    string
	PriceCents  int
	Stock       int
	Featured    bool
	CreatedAt   time.Time
}

type OrderLine struct {
	ProductID   string
	ProductName string
	Quantity    int
	UnitCents   int
	LineCents   int
}

type Order struct {
	ID           string
	Number       string
	CustomerName string
	Phone        string
	Address      string
	Lines        []OrderLine
	Status       string
	TotalCents   int
	CreatedAt    time.Time
}

type DashboardStats struct {
	ProductCount int
	OrderCount   int
	RevenueCents int
	LowStock     int
}

