import { NextRequest, NextResponse } from 'next/server';
import opensea from '@api/opensea';

export async function GET(request: NextRequest) {
  try {
    // Get the address from query parameters
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

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

    // Fetch user profile from OpenSea
    const { data } = await opensea.get_account({
      address_or_username: address
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
} 