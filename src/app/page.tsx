'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null); // ForceGraph3D library requires any type
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
        img: profile.profile_image_url || '/avatar.svg',
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createNodeThreeObject = (node: any) => { // ForceGraph3D library requires any type
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = useCallback((node: any) => { // ForceGraph3D library requires any type
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
    <div className="w-screen h-screen m-0 p-0 overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600">
      {/* Modal using shadcn Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              NFT Profile Explorer
            </DialogTitle>
            <DialogDescription className="text-base">
              Discover and visualize NFT collections in 3D space
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter Ethereum address or username"
                disabled={loading}
                className="w-full"
              />
            </div>
            {error && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-4">
                  <p className="text-sm text-red-600">{error}</p>
                </CardContent>
              </Card>
            )}
            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full"
              size="lg"
            >
              {loading ? 'Loading...' : 'Explore Profile'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
          linkColor={(link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
          nodeLabel={(node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
        <div className="fixed top-6 right-6 z-50">
          <Button
            onClick={loadCollection}
            disabled={loadingNFTs}
            variant="destructive"
            size="lg"
            className="shadow-lg"
          >
            {loadingNFTs ? 'Loading NFTs...' : `Load ${selectedProfile.id === 0 ? '' : 'Collector\'s '}Collection`}
          </Button>
        </div>
      )}

      {/* Load Collectors Button */}
      {showLoadCollectorsButton && selectedNFT && (
        <div className="fixed top-6 right-6 z-50">
          <Button
            onClick={loadCollectors}
            disabled={loadingCollectors}
            className="shadow-lg bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {loadingCollectors ? 'Loading Collectors...' : 'Load Collectors'}
          </Button>
        </div>
      )}

      {/* User Info Card */}
      {(userProfile || selectedProfile) && (
        <Card className="fixed top-6 left-6 max-w-sm z-20 backdrop-blur-md bg-black/80 border-white/20 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              {selectedProfile && selectedProfile.id !== 0 ? 
                `Collector: ${selectedProfile.username || 'Unknown'}` : 
                (userProfile?.username || 'Unknown User')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-white/10 p-2 rounded-md">
              <p className="text-xs font-mono break-all text-gray-300">
                {selectedProfile && selectedProfile.id !== 0 ? 
                  selectedProfile.contract || 'No address' : 
                  (userProfile?.address || 'No address')}
              </p>
            </div>
            {selectedProfile && selectedProfile.id !== 0 ? (
              <p className="text-sm text-purple-400">
                Click &quot;Load Collection&quot; to see their NFTs
              </p>
            ) : (
              <>
                {userProfile?.bio && (
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {userProfile.bio}
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  Joined: {userProfile?.joined_date ? new Date(userProfile.joined_date).toLocaleDateString() : 'Unknown'}
                </p>
                {nfts.length > 0 && (
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                    {nfts.length} NFTs loaded
                  </Badge>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* NFT Details Card */}
      {gData.nodes.find(node => node.nodeType === 'nft') && (
        <Card className="fixed bottom-6 left-6 max-w-sm z-20 backdrop-blur-md bg-black/80 border-white/20 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">NFT Collection Loaded</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-300 leading-relaxed">
              Click on any NFT node to see details and load collectors. NFTs are connected to their owners.
            </p>
            <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
              Total: {nfts.length} NFTs
            </Badge>
            
            {selectedNFT && selectedNFT.nodeType === 'nft' && (
              <div className="pt-3 border-t border-white/20">
                <p className="text-sm font-semibold mb-2">
                  Selected: {selectedNFT.username}
                </p>
                {collectors.has(selectedNFT.id.toString()) && (
                  <div className="space-y-2">
                    <Badge variant="secondary" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      {collectors.get(selectedNFT.id.toString())?.length || 0} collectors loaded
                    </Badge>
                    {filteredDuplicates.get(selectedNFT.id.toString()) ? (
                      <p className="text-xs text-orange-400 italic">
                        ({filteredDuplicates.get(selectedNFT.id.toString())} duplicate{filteredDuplicates.get(selectedNFT.id.toString()) !== 1 ? 's' : ''} filtered)
                      </p>
                    ) : null}
                    {/* Load More Collectors Button */}
                    {collectorPagination.get(selectedNFT.id.toString())?.hasMore && (
                      <Button
                        onClick={loadMoreCollectors}
                        disabled={loadingMoreCollectors}
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700"
                      >
                        {loadingMoreCollectors ? 'Loading...' : 'Load More Collectors (5)'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {hasMoreNFTs && (
              <Button
                onClick={loadMoreNFTs}
                disabled={loadingNFTs}
                size="sm"
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loadingNFTs ? 'Loading...' : 'Load More NFTs'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
