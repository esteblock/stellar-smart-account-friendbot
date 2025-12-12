# Stellar Testnet Friendbot Frontend

A simple frontend application to fund Stellar testnet wallets using the friendbot service.

## Features

- Input field for Stellar address (supports both regular accounts and smart contract accounts)
- Button with loading state
- Success message with link to stellar.expert
- Error handling
- Automatic smart contract account detection and funding via burner account

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`)

## Usage

1. Enter a valid Stellar testnet address:
   - Regular account: starts with G, 56 characters (e.g., `GDWI...`)
   - Smart contract account: starts with C, 56 characters (e.g., `CCZW...`)
2. Click "Fund Wallet"
3. Wait for the funding to complete
   - For regular accounts: Direct funding via friendbot
   - For smart contract accounts: Automatic burner account creation and fund transfer
4. View the transaction on stellar.expert using the provided link

## How it works

- **Regular accounts**: Funds directly via the Stellar friendbot API
- **Smart contract accounts**: Since friendbot doesn't support contract accounts directly, the app:
  1. Creates a temporary burner account
  2. Funds the burner account via friendbot
  3. Merges (deletes) the burner account, sending all XLM to the target contract address

## Build

To build for production:
```bash
npm run build
```

The built files will be in the `dist` directory.

