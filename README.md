# 🎮 API Game Shop

A TypeScript-based REST API for managing a game shop platform. This project provides backend services for game inventory management, user authentication, and transaction handling.

## 📋 Project Overview

**api_game_shop** is a Node.js application built with TypeScript that serves as the backend infrastructure for an online game shop. It handles core business logic for game listings, shopping cart management, order processing, and user management.

### Key Features
- 🔐 Secure user authentication and authorization
- 🎯 Game catalog management and search functionality
- 🛒 Shopping cart and order processing
- 💳 Transaction management
- 📊 RESTful API endpoints
- ⚡ Fast and efficient request handling with Nodemon for development

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/aintira11/api_game_shop.git
cd api_game_shop
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

### Development

Start the development server with hot reload:
```bash
npm run dev
```

The API will be available at `http://localhost:3000` (or your configured port).

## 📁 Project Structure

```
api_game_shop/
├── src/              # TypeScript source files
├── dist/             # Compiled JavaScript output
├── package.json      # Project metadata and dependencies
├── tsconfig.json     # TypeScript configuration
├── nodemon.json      # Nodemon configuration for development
└── README.md         # This file
```

## 🛠️ Technology Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Development**: Nodemon (auto-reload on file changes)
- **Build**: TypeScript Compiler

## 📦 Dependencies

Key dependencies managed in `package.json`:
- Express.js (or your chosen framework)
- Database driver (MongoDB, PostgreSQL, etc.)
- Additional utilities for API development

Install all dependencies with:
```bash
npm install
```

## 📝 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Available Endpoints
<!-- Add your specific endpoints here -->
- `GET /games` - List all games
- `POST /orders` - Create a new order
- `GET /users/:id` - Get user details
- (Add more as needed)

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=your_database_url
JWT_SECRET=your_secret_key
```

### TypeScript Configuration
TypeScript settings are defined in `tsconfig.json`. Modify as needed for your project requirements.

### Nodemon Configuration
Development auto-reload is configured in `nodemon.json` to watch your source files and restart the server on changes.

## 🧪 Testing

(Add your testing commands and framework here)

```bash
npm run test
```

## 🏗️ Building for Production

Build the TypeScript code:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## 📄 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server

## 🤝 Contributing

Contributions are welcome! Please feel free to:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## 👤 Author

**aintira11**
- GitHub: [@aintira11](https://github.com/aintira11)

**Last Updated**: April 10, 2026
