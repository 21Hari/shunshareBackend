const express = require('express');
const app = express();
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const cors = require("cors");
app.use(cors());
const PORT = 3000;
const dbpath = path.join(__dirname, 'shunshare.db');
app.use(express.json());

let db;

const intializeDBAndServer = async () => {
    try {
        db = await open({
            filename: dbpath,
            driver: sqlite3.Database
        });
        await db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      region TEXT,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      price REAL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER,
      productId INTEGER,
      quantity INTEGER,
      totalAmount REAL,
      orderDate TEXT,
      FOREIGN KEY(customerId) REFERENCES customers(id),
      FOREIGN KEY(productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS analytics_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startDate TEXT,
      endDate TEXT,
      totalOrders INTEGER,
      totalRevenue REAL,
      avgOrderValue REAL,
      topProducts TEXT,
      topCustomers TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.log(`DB Error: ${error.message}`);
        process.exit(1);
    }
};
intializeDBAndServer();

app.post("/seed", async (req, res) => {
    try {
        
        await db.run(`DELETE FROM customers`);
        await db.run(`DELETE FROM products`);
        await db.run(`DELETE FROM orders`);

       
        const customersData = [
            ["Hari", "hari@gmail.com", "South", "Premium"],
            ["Anita", "anita@gmail.com", "North", "Regular"],
            ["Ravi", "ravi@gmail.com", "East", "Premium"],
            ["Priya", "priya@gmail.com", "West", "Regular"],
            ["Karthik", "karthik@gmail.com", "South", "Premium"],
            ["Divya", "divya@gmail.com", "North", "Regular"],
            ["Ajay", "ajay@gmail.com", "East", "Premium"],
            ["Sneha", "sneha@gmail.com", "West", "Regular"],
            ["Vikram", "vikram@gmail.com", "South", "Premium"],
            ["Meena", "meena@gmail.com", "North", "Regular"]
        ];

        const customerIds = [];
        for (const c of customersData) {
            const result = await db.run(
                `INSERT INTO customers (name, email, region, type) VALUES (?, ?, ?, ?)`,
                c
            );
            customerIds.push(result.lastID);
        }

        // Sample products
        const productsData = [
            ["Laptop", "Electronics", 55000],
            ["Mobile", "Electronics", 30000],
            ["Headphones", "Electronics", 2000],
            ["Chair", "Furniture", 5000],
            ["Table", "Furniture", 7000],
            ["Shoes", "Fashion", 2500],
            ["Bag", "Fashion", 1500],
            ["Watch", "Fashion", 8000],
            ["Microwave", "Appliances", 12000],
            ["Refrigerator", "Appliances", 35000]
        ];

        const productIds = [];
        for (const p of productsData) {
            const result = await db.run(
                `INSERT INTO products (name, category, price) VALUES (?, ?, ?)`,
                p
            );
            productIds.push(result.lastID);
        }

        // Sample orders (random customer + product + quantity)
        const orderDates = [
            "2025-09-01", "2025-09-02", "2025-09-03", "2025-09-04", "2025-09-05",
            "2025-09-06", "2025-09-07", "2025-09-08", "2025-09-09", "2025-09-10"
        ];

        for (let i = 0; i < 10; i++) {
            const customerId = customerIds[i];
            const productId = productIds[i];
            const quantity = Math.floor(Math.random() * 5) + 1; 
            const totalAmount = quantity * (await db.get(`SELECT price FROM products WHERE id = ?`, [productId])).price;

            await db.run(
                `INSERT INTO orders (customerId, productId, quantity, totalAmount, orderDate) VALUES (?, ?, ?, ?, ?)`,
                [customerId, productId, quantity, totalAmount, orderDates[i]]
            );
        }

        res.status(201).json({ message: "10 sample customers, products, and orders inserted successfully!" });
    } catch (err) {
        console.error("Seed Error:", err.message);
        res.status(500).json({ error: "Failed to insert sample data." });
    }
});

app.post("/reports", async (req, res) => {
    try {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: "startDate and endDate are required." });
        }

        
        const orders = await db.all(
            `SELECT * FROM orders WHERE orderDate BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
        const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

        
        const topProducts = await db.all(`
      SELECT products.name, SUM(orders.quantity) AS count
      FROM orders
      JOIN products ON orders.productId = products.id
      WHERE orders.orderDate BETWEEN ? AND ?
      GROUP BY orders.productId
      ORDER BY count DESC
      LIMIT 5
    `, [startDate, endDate]);

      
        const topCustomers = await db.all(`
      SELECT customers.name, SUM(orders.totalAmount) AS spend
      FROM orders
      JOIN customers ON orders.customerId = customers.id
      WHERE orders.orderDate BETWEEN ? AND ?
      GROUP BY orders.customerId
      ORDER BY spend DESC
      LIMIT 5
    `, [startDate, endDate]);

        
        const result = await db.run(
            `INSERT INTO analytics_reports 
      (startDate, endDate, totalOrders, totalRevenue, avgOrderValue, topProducts, topCustomers)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                startDate,
                endDate,
                totalOrders,
                totalRevenue,
                avgOrderValue,
                JSON.stringify(topProducts),
                JSON.stringify(topCustomers),
            ]
        );

      
        const report = await db.get(`SELECT * FROM analytics_reports WHERE id = ?`, [result.lastID]);

        
        report.topProducts = report.topProducts ? JSON.parse(report.topProducts) : [];
        report.topCustomers = report.topCustomers ? JSON.parse(report.topCustomers) : [];

        res.status(201).json(report);

    } catch (err) {
        console.error("Generate Report Error:", err.message);
        res.status(500).json({ error: "Failed to generate report." });
    }
});

app.get("/reports", async (req, res) => {
    try {
        const reports = await db.all(
            `SELECT * FROM analytics_reports ORDER BY createdAt DESC`
        );

       
        const formattedReports = reports.map((r) => ({
            ...r,
            topProducts: r.topProducts ? JSON.parse(r.topProducts) : [],
            topCustomers: r.topCustomers ? JSON.parse(r.topCustomers) : [],
        }));

        res.status(200).json(formattedReports);
    } catch (err) {
        console.error("Fetch Reports Error:", err.message);
        res.status(500).json({ error: "Failed to fetch reports." });
    }
});


