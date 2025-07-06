'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';

// Dynamically import ForceGraph3D to avoid SSR issues
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
});

// Define the node type that extends the graph node structure
interface NodeData {
  id: number;
  img: string;
  username?: string;
  nodeType: 'profile' | 'nft';
  nftData?: NFTData;
  contract?: string;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

interface LinkData {
  source: number;
  target: number;
  linkType: 'profile-to-nft' | 'nft-to-nft';
}

interface UserProfile {
  address?: string;
  username?: string;
  profile_image_url?: string;
  banner_image_url?: string;
  website?: string;
  social_media_accounts?: unknown[];
  bio?: string;
  joined_date?: string;
}

interface NFTData {
  identifier: string;
  collection: string;
  contract: string;
  token_standard: string;
  name: string;
  description: string;
  image_url: string;
  display_image_url: string;
  display_animation_url?: string;
  metadata_url: string;
  opensea_url: string;
  updated_at: string;
  is_disabled: boolean;
  is_nsfw: boolean;
}

interface NFTResponse {
  nfts: NFTData[];
  next?: string;
}

export default function Home() {
  const fgRef = useRef<any>(null);
  const [showModal, setShowModal] = useState(true);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [loadingNFTs, setLoadingNFTs] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [hasMoreNFTs, setHasMoreNFTs] = useState(false);
  const [error, setError] = useState('');
  const [showLoadButton, setShowLoadButton] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState<NodeData | null>(null);
  const [showLoadCollectorsButton, setShowLoadCollectorsButton] = useState(false);
  const [loadingCollectors, setLoadingCollectors] = useState(false);
  const [collectors, setCollectors] = useState<Map<string, string[]>>(new Map()); // NFT ID -> collector addresses
  const [collectorProfiles, setCollectorProfiles] = useState<Map<string, UserProfile>>(new Map()); // address -> profile
  const [selectedProfile, setSelectedProfile] = useState<NodeData | null>(null);
  const [nftOwnership, setNftOwnership] = useState<Map<number, number>>(new Map()); // NFT index -> Profile node ID
  const [filteredDuplicates, setFilteredDuplicates] = useState<Map<string, number>>(new Map()); // NFT ID -> duplicate count
  const [collectorPagination, setCollectorPagination] = useState<Map<string, { cursor: string | null; hasMore: boolean }>>(new Map()); // NFT ID -> pagination info
  const [loadingMoreCollectors, setLoadingMoreCollectors] = useState(false);

  // Generate graph data based on user profile and NFTs
  const gData: { nodes: NodeData[]; links: LinkData[] } = {
    nodes: [
      // Profile node (always ID 0)
      ...(userProfile && userProfile.profile_image_url ? [{
        id: 0,
        img: userProfile.profile_image_url,
        username: userProfile.username || 'Unknown User',
        nodeType: 'profile' as const
      }] : []),
      // NFT nodes (starting from ID 1)
      ...nfts.map((nft, index) => ({
        id: index + 1,
        img: nft.image_url,
        username: nft.name,
        nodeType: 'nft' as const,
        nftData: nft,
        contract: nft.contract
      })),
      // Collector profile nodes
      ...Array.from(collectorProfiles.entries()).map(([address, profile], index) => ({
        id: 1000 + index, // Start at ID 1000 to avoid conflicts
        img: profile.profile_image_url || 'avatar.svg',
        username: profile.username || address.slice(0, 6) + '...' + address.slice(-4),
        nodeType: 'profile' as const,
        contract: address // Store address in contract field for identification
      }))
    ],
    links: [
      // Connect NFT nodes to their owner profile nodes
      ...nfts.map((_, index) => ({
        source: nftOwnership.get(index) || 0, // Owner profile node (default to main profile)
        target: index + 1, // NFT node
        linkType: 'profile-to-nft' as const
      })),
      // Connect NFT nodes that share the same contract
      ...(() => {
        const contractLinks: LinkData[] = [];
        for (let i = 0; i < nfts.length; i++) {
          for (let j = i + 1; j < nfts.length; j++) {
            if (nfts[i].contract === nfts[j].contract) {
              contractLinks.push({
                source: i + 1, // NFT node ID for first NFT
                target: j + 1, // NFT node ID for second NFT
                linkType: 'nft-to-nft' as const
              });
            }
          }
        }
        return contractLinks;
      })(),
      // Connect collectors to their NFTs
      ...Array.from(collectors.entries()).flatMap(([nftIdStr, collectorAddresses]) => {
        const nftId = parseInt(nftIdStr);
        const collectorNodeIds = collectorAddresses.map(addr => {
          const index = Array.from(collectorProfiles.keys()).indexOf(addr);
          return index >= 0 ? 1000 + index : -1;
        }).filter(id => id >= 0);
        
        return collectorNodeIds.map(collectorNodeId => ({
          source: collectorNodeId, // Collector node
          target: nftId, // NFT node
          linkType: 'profile-to-nft' as const
        }));
      })
    ]
  };

  // Create 3D object for each node using the image as a texture
  const createNodeThreeObject = (node: any) => {
    const nodeData = node as NodeData;
    const imgTexture = new THREE.TextureLoader().load(nodeData.img);
    imgTexture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: imgTexture });
    const sprite = new THREE.Sprite(material);
    
    // Different sizes for different node types
    if (nodeData.nodeType === 'profile') {
      sprite.scale.set(25, 25, 25); // Larger for profile
      
      // Add glow effect for profile nodes
      const glowGeometry = new THREE.SphereGeometry(15, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: nodeData.id === 0 ? 0x00aaff : 0x9C27B0, // Blue for main profile, purple for collectors
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      
      // Create a group to hold both the sprite and glow
      const group = new THREE.Group();
      group.add(sprite);
      group.add(glow);
      
      return group;
    } else {
      sprite.scale.set(15, 15, 15); // Smaller for NFTs
      return sprite;
    }
  };

  // Handle node click to focus camera on the clicked node
  const handleClick = useCallback((node: any) => {
    const nodeData = node as NodeData;
    console.log('Node clicked:', nodeData);
    
    if (nodeData.nodeType === 'profile') {
      // Any profile node (main or collector)
      setShowLoadButton(true);
      setShowLoadCollectorsButton(false);
      setSelectedNFT(null);
      setSelectedProfile(nodeData); // Set the selected profile node
    } else if (nodeData.nodeType === 'nft') {
      // NFT node
      setShowLoadButton(false);
      setShowLoadCollectorsButton(true);
      setSelectedNFT(nodeData);
      setSelectedProfile(null); // Deselect profile node
    } else {
      // Other nodes
      setShowLoadButton(false);
      setShowLoadCollectorsButton(false);
      setSelectedNFT(null);
      setSelectedProfile(null); // Deselect profile node
    }
    
    if (fgRef.current) {
      const graph = fgRef.current;
      if (graph && typeof graph === 'object' && 'cameraPosition' in graph) {
        // Get current node position or use default
        const nodeX = nodeData.x || 0;
        const nodeY = nodeData.y || 0;
        const nodeZ = nodeData.z || 0;
        
        // Calculate distance from origin
        const nodeDistance = Math.sqrt(nodeX * nodeX + nodeY * nodeY + nodeZ * nodeZ);
        
        // If node is at origin or very close, use a default camera position
        if (nodeDistance < 1) {
          graph.cameraPosition(
            { x: 0, y: 0, z: 80 }, // Default position
            { x: 0, y: 0, z: 0 },  // Look at origin
            2000  // ms transition duration
          );
        } else {
          // Calculate camera position outside the node
          const distance = nodeData.nodeType === 'profile' ? 80 : 50;
          const distRatio = 1 + distance / nodeDistance;
          
          graph.cameraPosition(
            { 
              x: nodeX * distRatio, 
              y: nodeY * distRatio, 
              z: nodeZ * distRatio 
            }, // new position
            { x: nodeX, y: nodeY, z: nodeZ }, // lookAt the node
            2000  // ms transition duration
          );
        }
      }
    }
  }, [fgRef]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) {
      setError('Please enter an Ethereum address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Call our internal API route instead of OpenSea directly
      const response = await fetch(`/api/opensea?address=${encodeURIComponent(address.trim())}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const data = await response.json();
      setUserProfile(data as UserProfile);
      setShowModal(false);
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setError('Failed to fetch user profile. Please check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle loading NFT collection
  const loadCollection = async () => {
    // Determine which profile address to use
    let profileAddress: string | undefined;
    
    if (selectedProfile) {
      if (selectedProfile.id === 0) {
        // Main profile node
        profileAddress = userProfile?.address;
      } else {
        // Collector profile node - address is stored in contract field
        profileAddress = selectedProfile.contract;
      }
    }
    
    if (!profileAddress) return;

    setLoadingNFTs(true);
    try {
      const response = await fetch(`/api/opensea/nfts?address=${encodeURIComponent(profileAddress)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch NFTs');
      }

      const data: NFTResponse = await response.json();
      
      // Track which profile owns these NFTs
      const ownershipMap = new Map(nftOwnership);
      const profileNodeId = selectedProfile?.id || 0;
      
      // Set ownership for each NFT
      data.nfts.forEach((_, index) => {
        ownershipMap.set(nfts.length + index, profileNodeId);
      });
      
      // Update state
      setNftOwnership(ownershipMap);
      setNfts(prevNfts => [...prevNfts, ...data.nfts]);
      setNextToken(data.next || null);
      setHasMoreNFTs(!!data.next);
      setShowLoadButton(false);
    } catch (err) {
      console.error('Error fetching NFTs:', err);
      setError('Failed to fetch NFTs. Please try again.');
    } finally {
      setLoadingNFTs(false);
    }
  };

  // Handle loading more NFTs
  const loadMoreNFTs = async () => {
    if (!selectedProfile || !nextToken) return;
    
    // Determine which profile address to use
    const profileAddress = selectedProfile.id === 0 ? userProfile?.address : selectedProfile.contract;
    if (!profileAddress) return;

    setLoadingNFTs(true);
    try {
      const response = await fetch(`/api/opensea/nfts?address=${encodeURIComponent(profileAddress)}&next=${encodeURIComponent(nextToken)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch more NFTs');
      }

      const data: NFTResponse = await response.json();
      
      // Track which profile owns these NFTs
      const ownershipMap = new Map(nftOwnership);
      const profileNodeId = selectedProfile.id;
      
      // Set ownership for each new NFT
      data.nfts.forEach((_, index) => {
        ownershipMap.set(nfts.length + index, profileNodeId);
      });
      
      // Update state
      setNftOwnership(ownershipMap);
      setNfts(prevNfts => [...prevNfts, ...data.nfts]);
      setNextToken(data.next || null);
      setHasMoreNFTs(!!data.next);
    } catch (err) {
      console.error('Error fetching more NFTs:', err);
      setError('Failed to fetch more NFTs. Please try again.');
    } finally {
      setLoadingNFTs(false);
    }
  };

  // Handle loading collectors for an NFT (first batch)
  const loadCollectors = async () => {
    if (!selectedNFT || !selectedNFT.nftData) return;

    setLoadingCollectors(true);
    try {
      const { contract, identifier } = selectedNFT.nftData;
      const nftId = selectedNFT.id.toString();
      
      // Fetch collectors from Moralis with cursor-based pagination (limit: 5, first page)
      const response = await fetch(`/api/moralis/collectors?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(identifier)}&limit=5`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch collectors');
      }

      const data = await response.json();
      const collectorAddresses: string[] = data.owners || [];
      const nextCursor = data.cursor;
      const hasMore = data.hasMore;

      // Filter out addresses that already exist as profile nodes
      const existingAddresses = new Set<string>();
      
      // Add main profile address
      if (userProfile?.address) {
        existingAddresses.add(userProfile.address.toLowerCase());
      }
      
      // Add all existing collector addresses
      collectorProfiles.forEach((_, address) => {
        existingAddresses.add(address.toLowerCase());
      });
      
      // Filter out duplicates
      const filteredCollectors = collectorAddresses.filter(addr => 
        !existingAddresses.has(addr.toLowerCase())
      );

      // Store collectors for this NFT
      setCollectors(prev => new Map(prev).set(nftId, filteredCollectors));

      // Set pagination info
      setCollectorPagination(prev => new Map(prev).set(nftId, { cursor: nextCursor, hasMore }));

      // Log if any collectors were filtered out
      const duplicatesFiltered = collectorAddresses.length - filteredCollectors.length;
      if (duplicatesFiltered > 0) {
        console.log(`Filtered out ${duplicatesFiltered} duplicate collector(s)`);
      }
      
      // Track filtered duplicates for UI display
      setFilteredDuplicates(prev => new Map(prev).set(nftId, duplicatesFiltered));

      // Fetch profiles for each collector
      const newProfiles = new Map(collectorProfiles);
      for (const address of filteredCollectors) {
        if (!newProfiles.has(address)) {
          try {
            const profileResponse = await fetch(`/api/opensea?address=${encodeURIComponent(address)}`);
            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              newProfiles.set(address, profileData);
            } else {
              // Create a basic profile for addresses without OpenSea profiles
              newProfiles.set(address, {
                address,
                username: address.slice(0, 6) + '...' + address.slice(-4),
                profile_image_url: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`
              });
            }
          } catch (err) {
            console.error(`Error fetching profile for ${address}:`, err);
            // Create a basic profile on error
            newProfiles.set(address, {
              address,
              username: address.slice(0, 6) + '...' + address.slice(-4),
              profile_image_url: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`
            });
          }
        }
      }
      
      setCollectorProfiles(newProfiles);
      setShowLoadCollectorsButton(false);
    } catch (err) {
      console.error('Error loading collectors:', err);
      setError('Failed to load collectors. Please try again.');
    } finally {
      setLoadingCollectors(false);
    }
  };

  // Handle loading more collectors for an NFT (next batch)
  const loadMoreCollectors = async () => {
    if (!selectedNFT || !selectedNFT.nftData) return;

    const nftId = selectedNFT.id.toString();
    const pagination = collectorPagination.get(nftId);
    if (!pagination || !pagination.hasMore) return;

    setLoadingMoreCollectors(true);
    try {
      const { contract, identifier } = selectedNFT.nftData;
      
      // Fetch next batch of collectors from Moralis using cursor
      const url = `/api/moralis/collectors?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(identifier)}&limit=5${pagination.cursor ? `&cursor=${encodeURIComponent(pagination.cursor)}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch more collectors');
      }

      const data = await response.json();
      const collectorAddresses: string[] = data.owners || [];
      const nextCursor = data.cursor;
      const hasMore = data.hasMore;

      // Filter out addresses that already exist as profile nodes
      const existingAddresses = new Set<string>();
      
      // Add main profile address
      if (userProfile?.address) {
        existingAddresses.add(userProfile.address.toLowerCase());
      }
      
      // Add all existing collector addresses
      collectorProfiles.forEach((_, address) => {
        existingAddresses.add(address.toLowerCase());
      });
      
      // Filter out duplicates
      const filteredCollectors = collectorAddresses.filter(addr => 
        !existingAddresses.has(addr.toLowerCase())
      );

      // Append new collectors to existing ones
      setCollectors(prev => {
        const current = prev.get(nftId) || [];
        return new Map(prev).set(nftId, [...current, ...filteredCollectors]);
      });

      // Update pagination info
      setCollectorPagination(prev => new Map(prev).set(nftId, { 
        cursor: nextCursor, 
        hasMore 
      }));

      // Update filtered duplicates count
      const duplicatesFiltered = collectorAddresses.length - filteredCollectors.length;
      if (duplicatesFiltered > 0) {
        console.log(`Filtered out ${duplicatesFiltered} more duplicate collector(s)`);
        setFilteredDuplicates(prev => {
          const current = prev.get(nftId) || 0;
          return new Map(prev).set(nftId, current + duplicatesFiltered);
        });
      }

      // Fetch profiles for each new collector
      const newProfiles = new Map(collectorProfiles);
      for (const address of filteredCollectors) {
        if (!newProfiles.has(address)) {
          try {
            const profileResponse = await fetch(`/api/opensea?address=${encodeURIComponent(address)}`);
            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              newProfiles.set(address, profileData);
            } else {
              // Create a basic profile for addresses without OpenSea profiles
              newProfiles.set(address, {
                address,
                username: address.slice(0, 6) + '...' + address.slice(-4),
                profile_image_url: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`
              });
            }
          } catch (err) {
            console.error(`Error fetching profile for ${address}:`, err);
            // Create a basic profile on error
            newProfiles.set(address, {
              address,
              username: address.slice(0, 6) + '...' + address.slice(-4),
              profile_image_url: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`
            });
          }
        }
      }
      
      setCollectorProfiles(newProfiles);
    } catch (err) {
      console.error('Error loading more collectors:', err);
      setError('Failed to load more collectors. Please try again.');
    } finally {
      setLoadingMoreCollectors(false);
    }
  };

  useEffect(() => {
    // Set initial camera position closer to the profile when loaded
    if (fgRef.current && userProfile) {
      const graph = fgRef.current;
      if (graph && typeof graph === 'object' && 'cameraPosition' in graph) {
        graph.cameraPosition({ z: 50 }); // Closer initial zoom
      }
    }
  }, [userProfile]);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      margin: 0, 
      padding: 0,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            padding: '2.5rem',
            borderRadius: '20px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.4)',
            width: '90%',
            maxWidth: '500px',
            textAlign: 'center',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <h2 style={{ 
              margin: '0 0 1rem 0', 
              color: '#1a1a1a',
              fontSize: '1.8rem',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              NFT Profile Explorer
            </h2>
            <p style={{ 
              margin: '0 0 1.5rem 0', 
              color: '#444',
              fontSize: '1.1rem',
              lineHeight: '1.5'
            }}>
              Discover and visualize NFT collections in 3D space
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter Ethereum address or username"
                style={{
                  width: '100%',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '2px solid #e1e5e9',
                  fontSize: '1rem',
                  marginBottom: '1rem',
                  boxSizing: 'border-box',
                  background: 'rgba(255, 255, 255, 0.9)',
                  color: '#1a1a1a',
                  fontWeight: '500',
                  transition: 'border-color 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e1e5e9'}
                disabled={loading}
              />
              {error && (
                <div style={{
                  backgroundColor: 'rgba(231, 76, 60, 0.1)',
                  border: '1px solid rgba(231, 76, 60, 0.3)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <p style={{ 
                    color: '#e74c3c', 
                    margin: '0',
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}>
                    {error}
                  </p>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: loading ? 'linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: loading ? 'none' : '0 8px 25px rgba(102, 126, 234, 0.4)',
                  transform: loading ? 'none' : 'translateY(0px)'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 35px rgba(102, 126, 234, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(0px)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.4)';
                  }
                }}
              >
                {loading ? 'Loading...' : 'Explore Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3D Graph */}
      {userProfile && userProfile.profile_image_url && (
        <ForceGraph3D
          ref={fgRef}
          graphData={gData}
          nodeThreeObject={createNodeThreeObject}
          onNodeClick={handleClick}
          width={typeof window !== 'undefined' ? window.innerWidth : 800}
          height={typeof window !== 'undefined' ? window.innerHeight : 600}
          backgroundColor="rgba(0,0,0,0)"
          linkColor={(link: any) => {
            const linkData = link as LinkData;
            return linkData.linkType === 'profile-to-nft' ? '#ffffff' : '#4CAF50';
          }}
          linkOpacity={0.6}
          linkWidth={0.5}
          linkCurvature={0.2}
          nodeRelSize={6}
          enableNodeDrag={true}
          enableNavigationControls={true}
          showNavInfo={true}
          nodeLabel={(node: any) => {
            const nodeData = node as NodeData;
            if (nodeData.nodeType === 'profile') {
              if (nodeData.id === 0) {
                return `${nodeData.username || 'Profile'} - Click to load collection`;
              } else {
                return `Collector: ${nodeData.username || 'Unknown'}\n${nodeData.contract || ''}\nClick to load collection`;
              }
            } else {
              return `${nodeData.username || 'NFT'}\n${nodeData.nftData?.description?.substring(0, 100) || ''}...\nContract: ${nodeData.contract || 'Unknown'}`;
            }
          }}
        />
      )}

      {/* Load Collection Button */}
      {showLoadButton && selectedProfile && (
        <div style={{
          position: 'fixed',
          top: '30px',
          right: '30px',
          zIndex: 500
        }}>
          <button
            onClick={loadCollection}
            disabled={loadingNFTs}
            style={{
              padding: '1rem 2rem',
              background: loadingNFTs ? 'linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%)' : 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: loadingNFTs ? 'not-allowed' : 'pointer',
              boxShadow: loadingNFTs ? 'none' : '0 8px 25px rgba(231, 76, 60, 0.4)',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              if (!loadingNFTs) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 35px rgba(231, 76, 60, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loadingNFTs) {
                e.currentTarget.style.transform = 'translateY(0px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(231, 76, 60, 0.4)';
              }
            }}
          >
            {loadingNFTs ? 'Loading NFTs...' : `Load ${selectedProfile.id === 0 ? '' : 'Collector\'s '}Collection`}
          </button>
        </div>
      )}

      {/* Load Collectors Button */}
      {showLoadCollectorsButton && selectedNFT && (
        <div style={{
          position: 'fixed',
          top: '30px',
          right: '30px',
          zIndex: 500
        }}>
          <button
            onClick={loadCollectors}
            disabled={loadingCollectors}
            style={{
              padding: '1rem 2rem',
              background: loadingCollectors ? 'linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%)' : 'linear-gradient(135deg, #9C27B0 0%, #673AB7 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1.1rem',
              fontWeight: '600',
              cursor: loadingCollectors ? 'not-allowed' : 'pointer',
              boxShadow: loadingCollectors ? 'none' : '0 8px 25px rgba(156, 39, 176, 0.4)',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              if (!loadingCollectors) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 35px rgba(156, 39, 176, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loadingCollectors) {
                e.currentTarget.style.transform = 'translateY(0px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(156, 39, 176, 0.4)';
              }
            }}
          >
            {loadingCollectors ? 'Loading Collectors...' : 'Load Collectors'}
          </button>
        </div>
      )}

      {/* User Info Overlay */}
      {(userProfile || selectedProfile) && (
        <div style={{
          position: 'absolute',
          top: '30px',
          left: '30px',
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(15px)',
          color: 'white',
          padding: '1.5rem',
          borderRadius: '16px',
          maxWidth: '320px',
          zIndex: 100,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}>
          <h3 style={{ 
            margin: '0 0 0.75rem 0', 
            fontSize: '1.3rem',
            fontWeight: '600',
            color: '#fff'
          }}>
            {selectedProfile && selectedProfile.id !== 0 ? 
              `Collector: ${selectedProfile.username || 'Unknown'}` : 
              (userProfile?.username || 'Unknown User')}
          </h3>
          <div style={{ 
            margin: '0 0 0.75rem 0', 
            fontSize: '0.9rem', 
            opacity: 0.8,
            wordBreak: 'break-all',
            lineHeight: '1.4',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '0.5rem',
            borderRadius: '8px'
          }}>
            {selectedProfile && selectedProfile.id !== 0 ? 
              selectedProfile.contract || 'No address' : 
              (userProfile?.address || 'No address')}
          </div>
          {selectedProfile && selectedProfile.id !== 0 ? (
            <p style={{ 
              margin: '0', 
              fontSize: '0.85rem', 
              color: '#9C27B0',
              fontWeight: '500'
            }}>
              Click &quot;Load Collection&quot; to see their NFTs
            </p>
          ) : (
            <>
              {userProfile?.bio && (
                <p style={{ 
                  margin: '0 0 0.75rem 0', 
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  color: '#e0e0e0'
                }}>
                  {userProfile.bio}
                </p>
              )}
              <p style={{ 
                margin: '0 0 0.75rem 0', 
                fontSize: '0.8rem', 
                opacity: 0.7,
                color: '#bbb'
              }}>
                Joined: {userProfile?.joined_date ? new Date(userProfile.joined_date).toLocaleDateString() : 'Unknown'}
              </p>
              {nfts.length > 0 && (
                <div style={{
                  backgroundColor: 'rgba(76, 175, 80, 0.2)',
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(76, 175, 80, 0.3)'
                }}>
                  <p style={{ 
                    margin: '0', 
                    fontSize: '0.85rem', 
                    color: '#4CAF50',
                    fontWeight: '600'
                  }}>
                    {nfts.length} NFTs loaded
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* NFT Details Overlay */}
      {gData.nodes.find(node => node.nodeType === 'nft') && (
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '30px',
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(15px)',
          color: 'white',
          padding: '1.5rem',
          borderRadius: '16px',
          maxWidth: '380px',
          zIndex: 100,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}>
          <h4 style={{ 
            margin: '0 0 0.75rem 0', 
            fontSize: '1.1rem',
            fontWeight: '600',
            color: '#fff'
          }}>
            NFT Collection Loaded
          </h4>
          <p style={{ 
            margin: '0 0 0.75rem 0', 
            fontSize: '0.85rem', 
            opacity: 0.8,
            lineHeight: '1.4',
            color: '#e0e0e0'
          }}>
            Click on any NFT node to see details and load collectors. NFTs are connected to their owners.
          </p>
          <div style={{
            backgroundColor: 'rgba(76, 175, 80, 0.2)',
            padding: '0.5rem',
            borderRadius: '8px',
            border: '1px solid rgba(76, 175, 80, 0.3)',
            marginBottom: '0.75rem'
          }}>
            <p style={{ 
              margin: '0', 
              fontSize: '0.85rem', 
              color: '#4CAF50',
              fontWeight: '600'
            }}>
              Total: {nfts.length} NFTs
            </p>
          </div>
          {selectedNFT && selectedNFT.nodeType === 'nft' && (
            <div style={{ 
              marginTop: '0.75rem', 
              paddingTop: '0.75rem', 
              borderTop: '1px solid rgba(255, 255, 255, 0.2)' 
            }}>
              <p style={{ 
                margin: '0 0 0.5rem 0', 
                fontSize: '0.9rem', 
                fontWeight: '600',
                color: '#fff'
              }}>
                Selected: {selectedNFT.username}
              </p>
              {collectors.has(selectedNFT.id.toString()) && (
                <>
                  <div style={{
                    backgroundColor: 'rgba(156, 39, 176, 0.2)',
                    padding: '0.5rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(156, 39, 176, 0.3)'
                  }}>
                    <p style={{ 
                      margin: '0', 
                      fontSize: '0.85rem', 
                      color: '#9C27B0',
                      fontWeight: '600'
                    }}>
                      {collectors.get(selectedNFT.id.toString())?.length || 0} collectors loaded
                    </p>
                  </div>
                  {filteredDuplicates.get(selectedNFT.id.toString()) ? (
                    <p style={{ 
                      margin: '0.5rem 0 0 0', 
                      fontSize: '0.75rem', 
                      color: '#FFA500', 
                      opacity: 0.8,
                      fontStyle: 'italic'
                    }}>
                      ({filteredDuplicates.get(selectedNFT.id.toString())} duplicate{filteredDuplicates.get(selectedNFT.id.toString()) !== 1 ? 's' : ''} filtered)
                    </p>
                  ) : null}
                  {/* Load More Collectors Button */}
                  {collectorPagination.get(selectedNFT.id.toString())?.hasMore && (
                    <button
                      onClick={loadMoreCollectors}
                      disabled={loadingMoreCollectors}
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: loadingMoreCollectors ? 'linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%)' : 'linear-gradient(135deg, #9C27B0 0%, #673AB7 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        cursor: loadingMoreCollectors ? 'not-allowed' : 'pointer',
                        width: '100%',
                        transition: 'all 0.3s ease',
                        boxShadow: loadingMoreCollectors ? 'none' : '0 4px 15px rgba(156, 39, 176, 0.3)'
                      }}
                      onMouseEnter={(e) => {
                        if (!loadingMoreCollectors) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(156, 39, 176, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!loadingMoreCollectors) {
                          e.currentTarget.style.transform = 'translateY(0px)';
                          e.currentTarget.style.boxShadow = '0 4px 15px rgba(156, 39, 176, 0.3)';
                        }
                      }}
                    >
                      {loadingMoreCollectors ? 'Loading...' : 'Load More Collectors (5)'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {hasMoreNFTs && (
            <button
              onClick={loadMoreNFTs}
              disabled={loadingNFTs}
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem 1.5rem',
                background: loadingNFTs ? 'linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%)' : 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: loadingNFTs ? 'not-allowed' : 'pointer',
                width: '100%',
                transition: 'all 0.3s ease',
                boxShadow: loadingNFTs ? 'none' : '0 4px 15px rgba(33, 150, 243, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (!loadingNFTs) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loadingNFTs) {
                  e.currentTarget.style.transform = 'translateY(0px)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(33, 150, 243, 0.3)';
                }
              }}
            >
              {loadingNFTs ? 'Loading...' : 'Load More NFTs'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
