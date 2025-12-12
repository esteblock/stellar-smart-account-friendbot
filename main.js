import { 
    StrKey, 
    Keypair, 
    Horizon,
    TransactionBuilder, 
    Networks, 
    BASE_FEE,
    Address,
    Contract,
    nativeToScVal,
    rpc,
    xdr
} from '@stellar/stellar-sdk';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const STELLAR_EXPERT_URL = 'https://stellar.expert/explorer/testnet/account';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

const form = document.getElementById('fundForm');
const addressInput = document.getElementById('address');
const submitBtn = document.getElementById('submitBtn');
const buttonText = document.getElementById('buttonText');
const loader = document.getElementById('loader');
const messageDiv = document.getElementById('message');

function showLoader(text = 'Funding...') {
    buttonText.textContent = text;
    loader.classList.remove('hidden');
    submitBtn.disabled = true;
}

function hideLoader() {
    buttonText.textContent = 'Fund Wallet';
    loader.classList.add('hidden');
    submitBtn.disabled = false;
}

function showMessage(text, isError = false, txHash = null, contractAddress = null) {
    messageDiv.textContent = '';
    messageDiv.className = `message ${isError ? 'error' : 'success'}`;
    messageDiv.classList.remove('hidden');
    
    if (!isError) {
        // Parse the address from the message or use the input value
        const address = addressInput.value.trim();
        const shortAddress = address.length > 8 
            ? `${address.substring(0, 4)}…${address.substring(address.length - 4)}`
            : address;
        
        const messageText = document.createTextNode(`Successfully funded ${shortAddress} on testnet.`);
        messageDiv.appendChild(messageText);
        
        // Add links based on what's available, each on a separate line
        if (txHash) {
            const br1 = document.createElement('br');
            messageDiv.appendChild(br1);
            const txLink = document.createElement('a');
            txLink.href = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
            txLink.target = '_blank';
            txLink.textContent = 'View tx on stellar.expert';
            messageDiv.appendChild(txLink);
        }
        
        if (contractAddress || address.startsWith('C')) {
            const contractAddr = contractAddress || address;
            const br2 = document.createElement('br');
            messageDiv.appendChild(br2);
            const contractLink = document.createElement('a');
            contractLink.href = `https://stellar.expert/explorer/testnet/contract/${contractAddr}`;
            contractLink.target = '_blank';
            contractLink.textContent = 'View contract on stellar.expert';
            messageDiv.appendChild(contractLink);
        }
        
        // Fallback: if no tx hash but regular account, show account link
        if (!txHash && !contractAddress && !address.startsWith('C')) {
            const br3 = document.createElement('br');
            messageDiv.appendChild(br3);
            const accountLink = document.createElement('a');
            accountLink.href = `${STELLAR_EXPERT_URL}/${address}`;
            accountLink.target = '_blank';
            accountLink.textContent = 'View on stellar.expert';
            messageDiv.appendChild(accountLink);
        }
    } else {
        messageDiv.textContent = text;
    }
}

function hideMessage() {
    messageDiv.classList.add('hidden');
}

async function fundWallet(address) {
    try {
        const response = await fetch(`${FRIENDBOT_URL}?addr=${address}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.detail || 'Failed to fund wallet');
        }
        
        return data;
    } catch (error) {
        throw new Error(error.message || 'Failed to fund wallet. Please check the address and try again.');
    }
}

async function fundSmartContractAccount(targetAddress) {
    const horizonServer = new Horizon.Server(HORIZON_URL);
    const sorobanServer = new rpc.Server(SOROBAN_RPC_URL);
    
    // Step 1: Create a new burner account
    const burnerKeypair = Keypair.random();
    const burnerAddress = burnerKeypair.publicKey();
    
    showLoader('Creating burner account...');
    
    // Step 2: Fund the burner account using friendbot
    try {
        await fundWallet(burnerAddress);
    } catch (error) {
        throw new Error(`Failed to fund burner account: ${error.message}`);
    }
    
    // Wait for the account to be available on the network (with retries)
    showLoader('Waiting for burner account to be available...');
    let sourceAccount;
    const maxRetries = 10;
    let retries = 0;
    
    while (retries < maxRetries) {
        console.log("🚀 ~ fundSmartContractAccount ~ retries:", retries)
        try {
            sourceAccount = await sorobanServer.getAccount(burnerAddress);
            console.log("🚀 ~ fundSmartContractAccount ~ sourceAccount:", sourceAccount)
            break;
        } catch (error) {
            retries++;
            if (retries >= maxRetries) {
                throw new Error(`Failed to load burner account after ${maxRetries} attempts: ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    console.log("🚀 ~ fundSmartContractAccount ~ sourceAccount:", sourceAccount)
    showLoader('Transferring funds to smart contract account...');
    
    // Step 4: Get the native XLM contract address for testnet
    // The native asset contract address (SAC - Stellar Asset Contract)
    const xlmContractAddress = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    
    // Step 5: Build transaction to send 9,998 XLM using the XLM contract's transfer function
    // Friendbot sends 10,000 XLM, we send 9,998 and leave ~2 XLM for fees
    // Amount in stroops: 9,998 XLM = 99980000000 stroops (1 XLM = 10,000,000 stroops)
    const amountInStroops = '99980000000';
    
    // Convert addresses to Address objects and then to ScVal
    const fromAddress = new Address(burnerAddress);
    const toAddress = new Address(targetAddress);
    
    // Convert Address objects to ScVal
    const fromScVal = xdr.ScVal.scvAddress(fromAddress.toScAddress());
    const toScVal = xdr.ScVal.scvAddress(toAddress.toScAddress());
    
    // For i128 amount, we need to convert the string to BigInt first
    const amountBigInt = BigInt(amountInStroops);
    
    // Convert amount to i128 ScVal
    // i128 is represented as Int128Parts with lo (low 64 bits) and hi (high 64 bits)
    const lo = amountBigInt & BigInt('0xFFFFFFFFFFFFFFFF'); // low 64 bits
    const hi = amountBigInt >> BigInt(64); // high 64 bits
    
    const amountScVal = xdr.ScVal.scvI128(
        new xdr.Int128Parts({
            lo: xdr.Uint64.fromString(lo.toString()),
            hi: xdr.Int64.fromString(hi.toString())
        })
    );
    
    // Build transaction with contract invocation
    const contract = new Contract(xlmContractAddress);
    const op = contract.call(
        'transfer',
        fromScVal,   // from address as ScVal
        toScVal,     // to address as ScVal
        amountScVal  // amount as i128 ScVal
    );
    
    let tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE, // Soroban resource fees are added after simulate+assemble
        networkPassphrase: Networks.TESTNET,
    })
    .addOperation(op)
    .setTimeout(60)
    .build();
    
    // Step 6: Simulate, assemble, sign and submit the transaction via Soroban RPC
    try {
        // Simulate (this figures out footprint, auth, and resource fees)
        const sim = await sorobanServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) {
            throw new Error(`Simulation failed: ${JSON.stringify(sim)}`);
        }
        
        // Assemble tx with simulation results (adds Soroban data + correct fees)
        tx = rpc.assembleTransaction(tx, sim).build();
        
        // Sign the transaction
        tx.sign(burnerKeypair);
        
        // Send the transaction
        const send = await sorobanServer.sendTransaction(tx);
        if (send.status !== 'PENDING') {
            throw new Error(`Send failed: ${JSON.stringify(send)}`);
        }
        
        console.log("🚀 ~ fundSmartContractAccount ~ send:", send)
        return { hash: send.hash, contractAddress: targetAddress };
    } catch (error) {
        console.log("🚀 ~ fundSmartContractAccount ~ error:", error)
        throw new Error(`Failed to transfer funds: ${error.message}`);
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const address = addressInput.value.trim();
    
    // Basic validation
    if (!address) {
        showMessage('Please enter a Stellar address', true);
        return;
    }
    
    // Stellar address validation - accepts both Ed25519 public keys (G...) and contract addresses (C...)
    const isValidAddress = StrKey.isValidEd25519PublicKey(address) || 
                           (address.startsWith('C') && address.length === 56 && /^[A-Z0-9]{56}$/.test(address));
    
    if (!isValidAddress) {
        showMessage('Invalid Stellar address format. Please enter a valid Stellar public key (G...) or contract address (C...).', true);
        return;
    }
    
    hideMessage();
    showLoader();
    
    try {
        // Check if it's a contract address (starts with C) - friendbot doesn't support these
        const isContractAddress = address.startsWith('C');
        
        if (isContractAddress) {
            // Contract addresses need the burner account approach
            showLoader('Smart contract account detected, using burner account...');
            const result = await fundSmartContractAccount(address);
            showMessage('', false, result.hash, result.contractAddress);
        } else {
            // Regular accounts can be funded directly
            try {
                await fundWallet(address);
                showMessage('', false);
            } catch (directFundError) {
                // If direct funding fails for some other reason, try burner account approach
                console.log('Direct funding failed, trying burner account approach...', directFundError);
                showLoader('Direct funding failed, using burner account...');
                
                const result = await fundSmartContractAccount(address);
                showMessage('', false, result.hash, result.contractAddress);
            }
        }
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        hideLoader();
    }
});

// Clear message when user starts typing
addressInput.addEventListener('input', () => {
    if (!messageDiv.classList.contains('hidden')) {
        hideMessage();
    }
});

