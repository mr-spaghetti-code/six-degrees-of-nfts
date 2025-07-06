import { NextRequest, NextResponse } from 'next/server';

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const contract = searchParams.get('contract');
  const limit = searchParams.get('limit') || '10';
  const next = searchParams.get('next');
  
  if (!contract) {
    return NextResponse.json({ error: 'Contract address is required' }, { status: 400 });
  }

  if (!OPENSEA_API_KEY) {
    return NextResponse.json({ error: 'OpenSea API key is not configured' }, { status: 500 });
  }

  try {
    let url = `https://api.opensea.io/api/v2/chain/ethereum/contract/${contract}/nfts?limit=${limit}`;
    
    // Add pagination cursor if provided
    if (next) {
      url += `&next=${encodeURIComponent(next)}`;
    }

    const response = await fetch(url, {
      headers: {
        'X-API-KEY': OPENSEA_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenSea API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching NFTs by contract:', error);
    return NextResponse.json(
      { error: 'Failed to fetch NFTs by contract' },
      { status: 500 }
    );
  }
} 