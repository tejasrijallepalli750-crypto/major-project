# AURA – E-Commerce Website with Payment Gateway

AURA is a full-stack e-commerce web application developed as a B.Tech major project. It provides an online shopping platform where customers can browse products, view product details, manage shopping carts, place orders and experience a payment gateway workflow.

The application combines a responsive React frontend, a Node.js and Express backend, MongoDB database integration, authentication, inventory management, order processing and Razorpay payment gateway integration.

**Live Application:** https://aura-store-e33i.onrender.com

**GitHub Repository:** https://github.com/tejasrijallepalli750-crypto/major-project

---

## Table of Contents

1. Project Overview
2. Project Objectives
3. Features
4. Technology Stack
5. System Architecture
6. Project Structure
7. Application Modules
8. Database Design
9. Authentication and Security
10. Inventory Management
11. Payment Gateway Integration
12. Installation and Setup
13. Environment Configuration
14. Running the Application
15. Testing and Validation
16. Deployment
17. Future Enhancements
18. Learning Outcomes
19. Conclusion

---

## 1. Project Overview

AURA is an online shopping application designed to provide customers with a convenient and user-friendly e-commerce experience.

The platform supports product browsing, customer authentication, shopping cart management, checkout, order processing, payment integration and administrative management.

The project follows a full-stack architecture in which the frontend communicates with backend REST APIs, while MongoDB stores application information.

Razorpay is integrated in TEST mode to demonstrate the payment workflow without processing real customer payments.

## 2. Project Objectives

The main objectives of AURA are:

- To develop a complete full-stack e-commerce application.
- To provide an interactive and responsive shopping interface.
- To implement secure customer registration and login.
- To develop REST APIs for product, customer, cart and order operations.
- To integrate MongoDB for persistent data storage.
- To implement inventory and stock management.
- To integrate Razorpay for payment gateway testing.
- To provide an administrative dashboard.
- To implement order history and invoice generation.
- To deploy the application on a cloud hosting platform.

## 3. Features

### Customer Features

- Customer registration and login.
- Responsive shopping interface.
- Product catalogue and product detail pages.
- Product search and category browsing.
- Shopping cart management.
- Add products to cart and update quantities.
- Buy Now functionality for eligible products.
- Checkout and order creation.
- Razorpay TEST payment workflow.
- Order history and order details.
- Order confirmation.
- Invoice generation.

### Product Management

- Product information management.
- Product images and descriptions.
- Product categories and prices.
- Product availability management.
- Active and inactive product status.
- Product inventory validation.

### Admin Features

- Secure administrator authentication.
- Administrative dashboard.
- Product management.
- Inventory management.
- Order management.
- Customer order information.
- Payment and order status information.

### Payment Features

- Razorpay payment gateway integration.
- Razorpay TEST mode support.
- Server-side payment order creation.
- Payment signature verification.
- Payment amount and currency validation.
- Order ownership verification.
- Payment status reconciliation.

### Additional Features

- Email notifications for supported order events.
- Invoice and receipt generation.
- Separate physical and demonstration inventory.
- Server-side request validation.
- Error handling and API protection.
- Automated tests for important application workflows.

## 4. Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React.js, TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS, CSS |
| Backend | Node.js, Express.js |
| Programming Language | TypeScript, JavaScript |
| Database | MongoDB |
| ODM | Mongoose |
| Authentication | JWT-based authentication |
| Payment Gateway | Razorpay TEST API |
| API Communication | REST APIs |
| Version Control | Git and GitHub |
| Deployment | Render |
| Development Environment | Visual Studio Code |

## 5. System Architecture

AURA follows a full-stack client-server architecture.

### Frontend Layer

The frontend is developed using React and TypeScript. It provides the user interface for customers and administrators.

It communicates with the backend through REST API requests.

### Backend Layer

The backend uses Node.js and Express.js to handle:

- Authentication and authorization.
- Product operations.
- Cart and order operations.
- Inventory validation.
- Payment order creation.
- Payment verification.
- Administrative operations.

### Database Layer

MongoDB provides persistent storage for application data.

Mongoose is used to define schemas, models and database operations.

### Payment Layer

Razorpay is integrated to demonstrate secure payment processing using TEST credentials.

The backend is responsible for payment order creation and verification.

### Architecture Flow

```text
Customer / Administrator
          |
          v
    React Frontend
          |
          v
      REST APIs
          |
          v
   Node.js + Express
          |
     +----+----+
     |         |
     v         v
  MongoDB   Razorpay
 Database   TEST API
     |         |
     +----+----+
          |
          v
   Order Processing
          |
          v
   Frontend Response
```

## 6. Project Structure

The project is organised into frontend, backend, database, configuration, testing and utility modules.

```text
major-project/
│
├── public/
│
├── src/
│   ├── components/
│   │   ├── CartDrawer.tsx
│   │   ├── ProductCard.tsx
│   │   └── ...
│   │
│   ├── context/
│   │   └── CartContext.tsx
│   │
│   ├── pages/
│   │   ├── ProductDetailPage.tsx
│   │   ├── CartPage.tsx
│   │   ├── CheckoutPage.tsx
│   │   ├── OrderHistoryPage.tsx
│   │   ├── OrderConfirmationPage.tsx
│   │   ├── AdminDashboard.tsx
│   │   └── ...
│   │
│   ├── services/
│   │   └── api.ts
│   │
│   ├── types/
│   │
│   └── utils/
│       ├── invoiceGenerator.ts
│       ├── productPresentation.ts
│       └── orderPresentation.ts
│
├── server/
│   ├── config/
│   │
│   ├── db/
│   │   ├── database.ts
│   │   ├── mongo.ts
│   │   └── ...
│   │
│   ├── email/
│   │
│   ├── middleware/
│   │
│   ├── models/
│   │
│   ├── orders/
│   │
│   ├── payments/
│   │
│   ├── routes/
│   │
│   └── utils/
│
├── scripts/
│
├── server.ts
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## 7. Application Modules

### 7.1 User Authentication Module

This module handles customer registration, login and authenticated access.

It uses JWT-based authentication and role-based authorization to protect restricted application functionality.

### 7.2 Product Module

This module provides product information through backend APIs.

It supports product listing, individual product details, categories, availability and product management.

### 7.3 Shopping Cart Module

The cart module allows customers to manage selected products and quantities before checkout.

It calculates cart totals and validates product purchase eligibility.

### 7.4 Order Management Module

The order module handles order creation, order details, customer order history and administrative order operations.

It validates stock availability before creating purchase orders.

### 7.5 Inventory Management Module

The inventory module manages physical inventory separately from demonstration inventory.

It uses backend validation and conditional stock allocation to prevent invalid purchases and overselling.

### 7.6 Payment Module

The payment module integrates Razorpay TEST mode.

It creates payment orders, verifies payment signatures and checks payment amounts and currencies.

### 7.7 Invoice Module

The invoice module generates order-related invoices and receipts.

Demonstration orders are clearly identified as TEST/DEMO orders.

### 7.8 Admin Module

The admin module provides protected interfaces for managing products, inventory and customer orders.

## 8. Database Design

MongoDB is used as the primary database.

The application uses Mongoose schemas and models to manage structured application information.

The main collections include:

| Collection | Purpose |
|---|---|
| `aurausers` | Customer and administrator accounts |
| `auraproducts` | Product catalogue and inventory |
| `auraorders` | Customer orders and payment information |
| `aurareviews` | Product reviews |

The database contains product information, customer account information, order records, inventory details and related application data.

## 9. Authentication and Security

Security is an important part of the AURA application.

Implemented security features include:

- JWT-based authentication.
- Role-based access control.
- Protected administrative routes.
- Server-side input validation.
- Order ownership checks.
- Environment-based configuration.
- Payment signature verification.
- Payment amount and currency validation.
- Conditional inventory allocation.
- Separate physical and demonstration inventory.
- Safe handling of application errors.

Sensitive credentials are stored in environment variables and must not be committed to the GitHub repository.

## 10. Inventory Management

AURA maintains separate mechanisms for physical inventory and demonstration inventory.

### Physical Inventory

Physical product purchases require:

- An active product.
- Explicitly verified inventory.
- Sufficient physical stock.
- Successful backend inventory validation.

Physical stock allocation is handled by the backend.

### Demonstration Inventory

Demonstration purchasing uses a separate `demoStock` value.

It does not modify physical stock or mark physical inventory as verified.

Demo purchases are explicitly labelled and excluded from physical fulfilment.

The production demonstration checkout feature is disabled by default and requires explicit server-side configuration.

## 11. Payment Gateway Integration

Razorpay is integrated into AURA to demonstrate the online payment workflow.

### Payment Workflow

```text
Customer selects product
          |
          v
     Checkout Page
          |
          v
   Backend Order Creation
          |
          v
 Razorpay TEST Order Creation
          |
          v
  Customer Payment Interface
          |
          v
   Payment Confirmation
          |
          v
 Server-Side Signature Verification
          |
          v
 Payment Amount and Currency Check
          |
          v
    Order Status Update
```

### Payment Security

The application performs server-side verification of payment details.

The frontend payment response alone is not considered sufficient proof of successful payment.

### TEST Mode Notice

AURA uses Razorpay TEST credentials for demonstration.

- TEST payments do not collect real money.
- Demo orders are not genuine commercial purchases.
- Demo inventory is independent of physical stock.
- Demo orders do not promise shipment or physical delivery.
- Live payment credentials must not be used to activate demo purchasing.

## 12. Installation and Setup

### Prerequisites

Before installing the project, ensure that the following are available:

- Node.js
- npm
- MongoDB or a MongoDB Atlas database
- Git
- Visual Studio Code
- Razorpay TEST account credentials for payment testing

### Step 1: Clone the Repository

```bash
git clone https://github.com/tejasrijallepalli750-crypto/major-project.git
```

### Step 2: Open the Project

```bash
cd major-project
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Environment Variables

Create a local `.env` file using `.env.example` as a reference.

Configure the MongoDB connection, JWT secret and Razorpay TEST credentials.

### Step 5: Run the Application

Check the available npm scripts:

```bash
npm run
```

Use the development command configured in `package.json`.

## 13. Environment Configuration

The application uses environment variables for database connectivity, authentication, payment integration and feature configuration.

Example configuration:

```env
NODE_ENV=development
PORT=3000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_secure_random_secret

RAZORPAY_KEY_ID=rzp_test_your_test_key_id
RAZORPAY_KEY_SECRET=your_razorpay_test_secret

DEMO_MODE_ENABLED=false

PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED=false
```

**Important Security Guidelines**

- Never upload `.env` to GitHub.
- Never expose database credentials.
- Never publish JWT secrets.
- Never expose Razorpay secret keys in frontend code.
- Use separate database credentials for development and production.
- Include the intended database name in the MongoDB connection URI.
- Keep demo checkout disabled unless it is intentionally enabled with Razorpay TEST credentials.

The values above are examples. Actual credentials must be configured privately in the local environment or deployment dashboard.

## 14. Running the Application

The application uses npm scripts configured in `package.json`.

Useful development and validation commands include:

```bash
npm run
npm test
npm run lint
npm run build
```

The available scripts can be checked using `npm run`.

The test command runs automated tests, the lint command checks code quality, and the build command creates the frontend production build.

## 15. Testing and Validation

Testing is performed to verify application functionality and important security-related behaviour.

The project includes tests covering:

- Product presentation and purchase eligibility.
- Inventory validation.
- Demo inventory allocation.
- Order creation.
- Payment verification.
- Customer and administrator functionality.
- Email notifications.
- Invoice generation.
- Order confirmation.
- Error handling.

Run the validation commands before making changes available for deployment:

```bash
npm test
npm run lint
npm run build
```

## 16. Deployment

AURA is hosted using Render and connected to its GitHub repository.

### Deployment Workflow

1. Maintain the project source code in GitHub.
2. Commit and push reviewed code changes.
3. Allow Render to detect the new GitHub commit.
4. Wait for the deployment to finish.
5. Configure the required environment variables in Render.
6. Verify the backend health endpoint.
7. Test the live frontend and backend functionality.

**Live Application:**

https://aura-store-e33i.onrender.com

**Health Endpoint:**

https://aura-store-e33i.onrender.com/api/health

**GitHub Repository:**

https://github.com/tejasrijallepalli750-crypto/major-project

The production database and payment configuration must be checked before enabling purchasing functionality.

## 17. Future Enhancements

Potential future improvements include:

- Advanced product recommendation functionality.
- Improved filtering and sorting.
- Enhanced customer analytics.
- Improved order tracking.
- Additional payment gateway options.
- Better product discovery.
- Performance optimisation for large product catalogues.
- Enhanced administration and reporting features.
- Additional automated integration tests.

## 18. Learning Outcomes

Developing AURA provides practical experience in:

- Full-stack web application development.
- React and TypeScript frontend development.
- Node.js and Express backend development.
- REST API design and implementation.
- MongoDB database integration.
- Authentication and authorization.
- Inventory and order management.
- Payment gateway integration.
- Backend validation and security.
- Automated testing.
- Git and GitHub version control.
- Cloud deployment using Render.

## 19. Conclusion

AURA demonstrates the development of a full-stack e-commerce application using modern web technologies.

The project integrates frontend development, backend API implementation, MongoDB database management, customer authentication, inventory handling, order processing and Razorpay payment gateway testing.

The application focuses on usability, secure transaction workflows, maintainable architecture and a practical online shopping experience.

It provides an opportunity to apply full-stack development concepts to a real-world academic project while gaining practical experience with modern development tools and deployment platforms.

---

**Project Name:** AURA – E-Commerce Website with Payment Gateway

**Project Type:** B.Tech Major Project

**Repository:** https://github.com/tejasrijallepalli750-crypto/major-project

**Deployment:** Render
