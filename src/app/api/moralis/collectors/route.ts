import { NextRequest, NextResponse } from 'next/server';
import Moralis from 'moralis';

interface NFTOwnerItem {
  owner_of: string;
  amount?: string;
  token_id: string;
  token_address: string;
  contract_type: string;
  block_number: string;
  block_number_minted: string;
  [key: string]: unknown;
}

interface GetNFTTokenIdOwnersOptions {
  chain: string;
  format: "decimal" | "hex";
  limit: number;
  address: string;
  tokenId: string;
  cursor?: string;
}

// Track if Moralis has been initialized
let moralisInitialized = false;

export async function GET(request: NextRequest) {
  try {
    // Get parameters from query
    const { searchParams } = new URL(request.url);
    const contract = searchParams.get('contract');
    const tokenId = searchParams.get('tokenId');
    const limit = parseInt(searchParams.get('limit') || '5', 10);
    const cursor = searchParams.get('cursor'); // Use cursor for pagination

    if (!contract || !tokenId) {
      return NextResponse.json({ error: 'Contract and tokenId parameters are required' }, { status: 400 });
    }

    // Check if API key is available
    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Moralis API key not configured' }, { status: 500 });
    }

    // Initialize Moralis only if not already initialized
    if (!moralisInitialized) {
      try {
        await Moralis.start({
          apiKey: apiKey
        });
        moralisInitialized = true;
      } catch (err) {
        // If error is about already being started, that's okay
        const error = err as Error;
        if (error.message && error.message.includes('Modules are started already')) {
          moralisInitialized = true;
        } else {
          throw err;
        }
      }
    }

    // Fetch NFT owners with cursor-based pagination
    const requestOptions: GetNFTTokenIdOwnersOptions = {
      chain: "0x1", // Ethereum mainnet
      format: "decimal",
      limit: limit,
      address: contract,
      tokenId: tokenId
    };

    // Add cursor if provided for pagination
    if (cursor) {
      requestOptions.cursor = cursor;
    }
    
    const response = await Moralis.EvmApi.nft.getNFTTokenIdOwners(requestOptions);

    // Extract owner addresses from the response
    const owners = response.raw.result?.map((item: NFTOwnerItem) => item.owner_of) || [];
    
    // Get pagination info from the response
    const nextCursor = response.raw.cursor;
    const hasMore = !!nextCursor; // If there's a cursor, there are more pages

    return NextResponse.json({ 
      owners, 
      cursor: nextCursor,
      hasMore 
    });
  } catch (error) {
    console.error('Error fetching NFT collectors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch NFT collectors' },
      { status: 500 }
    );
  }
} 