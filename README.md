AURA — E-Commerce Website with Payment Gateway
AURA is a full-stack e-commerce web application built as a B.Tech major project. It includes a product catalogue, customer accounts, shopping cart, order management, an admin dashboard, and Razorpay payment integration in TEST mode.
Payment and fulfilment notice: Razorpay TEST payments are for demonstration and development only. A successful demo/test checkout is not a real purchase, does not collect a real payment, and does not promise physical shipment. Physical purchasing must use inventory that has been explicitly verified by an administrator.

Project Links
- GitHub Repository: https://github.com/tejasrijallepalli750-crypto/major-project
- Live Application: https://aura-store-e33i.onrender.com
- Hosting: Render
Features
Customer Experience
- Browse and view product details.
- Search and explore the product catalogue.
- Add eligible products to the shopping cart and manage quantities.
- Register, sign in, and access customer account features.
- Place orders through the checkout flow when the product and inventory are eligible.
- View order history, order details, and order confirmations.
- Generate order invoices and receipts.
Administration
- Admin-protected dashboard and management routes.
- Manage product and inventory information.
- Review customer orders and their payment/order status.
- Physical inventory must be explicitly verified before physical purchases are allowed.
Payments and Demo Checkout
- Razorpay integration using TEST credentials (rzp_test_...).
- Server-side payment signature and payment/order checks.
- Separate physical stock and demonstration stock.
- Explicitly labelled TEST/DEMO orders.
- Demo orders are not physical fulfilment orders and must not be shipped.
- Production demo checkout is disabled by default and requires an explicit server-side opt-in.
Technology Stack
Layer	Technology
Frontend	React, TypeScript, Vite
Styling	Tailwind CSS and utility-based styling
Backend	Node.js, Express, TypeScript
Database	MongoDB with Mongoose
Authentication	JWT-based authentication and role checks
Payment Gateway	Razorpay (TEST mode)
Hosting	Render
Source Control	Git and GitHub

Application Structure
The repository is organised around the frontend, backend, and shared application types.
major-project/
├── server/                  # Express API, database, models, routes and services
│   ├── config/              # Server configuration and feature gates
│   ├── db/                  # MongoDB connection and database operations
│   ├── email/               # Transactional email helpers
│   ├── middleware/          # Authentication and request middleware
│   ├── models/              # Mongoose models
│   ├── orders/              # Order and inventory operations
│   ├── payments/            # Razorpay integration and payment helpers
│   └── routes/              # API routes
├── src/                     # React frontend
│   ├── components/          # Reusable UI components
│   ├── context/             # Shared frontend state
│   ├── pages/               # Application pages
│   ├── services/            # API client and service functions
│   ├── types/               # Shared TypeScript types
│   └── utils/               # Presentation and invoice utilities
├── scripts/                 # Project maintenance and data scripts
├── server.ts                # Backend server entry point
├── package.json
└── vite.config.ts


Getting Started
Prerequisites
Install the following before running the project locally:
- Node.js (use a current LTS release where possible).
- npm.
- A MongoDB database that you control.
- Razorpay TEST account credentials for testing payment flows.
1. Clone the Repository
git clone https://github.com/tejasrijallepalli750-crypto/major-project.git
cd major-project


2. Install Dependencies
npm install


3. Configure Environment Variables
Create a local .env file in the project root. Use your own development database and your own Razorpay TEST credentials. The following is a template; replace the placeholders with your own values.
NODE_ENV=development
PORT=3000

# Use a development MongoDB database you control.
# Include the intended database name in the connection URI.
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/<your-development-database>?retryWrites=true&w=majority

# Use a long, random, private value. Never commit it.
JWT_SECRET=<your-long-random-jwt-secret>

# Razorpay TEST credentials only. Never use live credentials for demo checkout.
RAZORPAY_KEY_ID=rzp_test_<your-test-key-id>
RAZORPAY_KEY_SECRET=<your-test-key-secret>

# Keep demo checkout disabled unless you are deliberately testing it.
DEMO_MODE_ENABLED=false
PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED=false


Environment Variable Safety
- Never commit .env or publish database URIs, passwords, JWT secrets, or Razorpay secrets.
- Keep .env out of Git. Use .env.example as a reference, not as a place for real credentials.
- Do not point a local experiment at the production database. Use a separate development/test database.
- Do not add secrets to frontend variables such as VITE_*; frontend variables are exposed to the browser.
- The database name in MONGODB_URI matters. Include the intended database name in the URI path rather than relying on MongoDB's default database.
4. Run the Project
The exact scripts available in this repository are defined in package.json. List them with:
npm run


Use the development script shown there to start the frontend/backend development environment. For a production-style server start, use the configured start script after following the project's build requirements.
Useful Project Commands
The following validation commands are configured in the project:
npm test
npm run lint
npm run build


- npm test runs the automated test suite.
- npm run lint checks code quality and TypeScript/lint rules configured by the project.
- npm run build creates the production frontend build.
Inventory and Checkout Rules
AURA keeps physical inventory and demonstration inventory separate.
Physical Purchases
A physical purchase is allowed only when the product is active, its inventory status is explicitly verified, and sufficient physical stock is available. Physical stock is reserved through the backend's inventory workflow.
TEST/DEMO Purchases
A demo purchase uses the product's separate demoStock quantity. It must be clearly labelled as TEST/DEMO, must use Razorpay TEST credentials, and must never change physical stock or represent a promise to ship goods.

The production demo-checkout feature is off by default. The server-side flag is:
PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED=false


Only an authorised project operator should consider changing this setting to true, and only when the server has the matching Razorpay TEST key ID and secret. Never enable demo checkout with Razorpay live credentials. A TEST payment is not a real customer payment.
Deployment
The application is hosted on Render and connected to the GitHub repository.

For a deployment:
1. Push the reviewed code to the configured GitHub branch.
2. Allow Render's automatic deployment to complete.
3. Configure production environment variables in the Render service settings (not in the repository).
4. Use a production MongoDB URI with the intended database name in its path.
5. Keep Razorpay in TEST mode for demonstrations and portfolio evaluation.
6. Keep PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED disabled unless the demo checkout has been intentionally reviewed and enabled.
7. Check the service logs and health endpoint after deployment.
Do not put credentials in this README, GitHub commits, screenshots, or frontend code.
Security Notes
- Customer and admin routes require the appropriate authentication/authorization.
- Payment verification is performed on the server; frontend success alone must not be treated as proof of payment.
- The server validates payment details such as the Razorpay signature, order association, amount, and currency.
- Physical inventory verification is separate from demo-stock eligibility.
- Demo/test orders must remain excluded from physical fulfilment.
- Use separate development, test, and production databases where practical.
Testing
The project includes automated tests for backend routes and services, inventory rules, payment handling, and frontend presentation/checkout behaviour. Run the full suite before submitting changes:
npm test
npm run lint
npm run build


Test results can change as the code evolves; run these commands against the current checkout before reporting a new result.
Project Status
AURA is an actively developed academic/portfolio project. The live site and payment demonstration are subject to the deployed configuration and inventory eligibility rules. Razorpay TEST mode is intended for demonstration, not real commercial transactions.
Author and Contribution
This repository is maintained as a student major project. For changes, create a branch, make a focused update, run the tests and lint checks, and submit a pull request or reviewed commit.
License
No open-source licence is specified in this repository. All rights remain with the repository owner unless a licence is added.
