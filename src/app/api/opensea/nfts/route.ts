import { NextRequest, NextResponse } from 'next/server';
import opensea from '@api/opensea';

export async function GET(request: NextRequest) {
  try {
    // Get the address and next token from query parameters
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const next = searchParams.get('next');

    if (!address) {
      return NextResponse.json({ error: 'Address parameter is required' }, { status: 400 });
    }

    // Check if API key is available
    const apiKey = process.env.OPENSEA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenSea API key not configured' }, { status: 500 });
    }

    // Initialize OpenSea API with API key from environment
    opensea.auth(apiKey);

    // Build the request parameters
    const params: {
      limit: number;
      chain: 'ethereum';
      address: string;
      next?: string;
    } = {
      limit: 5,
      chain: 'ethereum',
      address: address
    };

    // Add next token if provided for pagination
    if (next) {
      params.next = next;
    }

    // Fetch NFTs for the address
    const { data } = await opensea.list_nfts_by_account(params);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch NFTs' },
      { status: 500 }
    );
  }
} 