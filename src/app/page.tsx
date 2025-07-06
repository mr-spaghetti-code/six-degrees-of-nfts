'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
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

  const [loadingCollectors, setLoadingCollectors] = useState(false);
  const [collectors, setCollectors] = useState<Map<string, string[]>>(new Map()); // NFT ID -> collector addresses
  const [collectorProfiles, setCollectorProfiles] = useState<Map<string, UserProfile>>(new Map()); // address -> profile
  const [selectedProfile, setSelectedProfile] = useState<NodeData | null>(null);
  const [nftOwnership, setNftOwnership] = useState<Map<number, number>>(new Map()); // NFT index -> Profile node ID
  const [filteredDuplicates, setFilteredDuplicates] = useState<Map<string, number>>(new Map()); // NFT ID -> duplicate count
  const [collectorPagination, setCollectorPagination] = useState<Map<string, { cursor: string | null; hasMore: boolean }>>(new Map()); // NFT ID -> pagination info
  const [loadingMoreCollectors, setLoadingMoreCollectors] = useState(false);
  const [existingNFTs, setExistingNFTs] = useState<Map<string, number>>(new Map()); // contract+identifier -> NFT index
  const [multiOwnership, setMultiOwnership] = useState<Map<number, Set<number>>>(new Map()); // NFT index -> Set of Profile node IDs

  // Generate graph data based on user profile and NFTs - memoized to prevent re-renders
  const gData = useMemo(() => ({
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
      ...nfts.flatMap((_, index) => {
        const owners = multiOwnership.get(index) || new Set([nftOwnership.get(index) || 0]);
        return Array.from(owners).map(ownerNodeId => ({
          source: ownerNodeId, // Owner profile node
          target: index + 1, // NFT node
          linkType: 'profile-to-nft' as const
        }));
      }),
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
  }), [userProfile, nfts, collectorProfiles, collectors, nftOwnership, multiOwnership]);

  // Create 3D object for each node using the image as a texture - memoized for stability
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createNodeThreeObject = useCallback((node: any) => { // ForceGraph3D library requires any type
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
  }, []);

  // Handle node click to focus camera on the clicked node
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = useCallback((node: any) => { // ForceGraph3D library requires any type
    const nodeData = node as NodeData;
    console.log('Node clicked:', nodeData);
    
    if (nodeData.nodeType === 'profile') {
      // Any profile node (main or collector)
      setShowLoadButton(true);
      setSelectedNFT(null);
      setSelectedProfile(nodeData); // Set the selected profile node
    } else if (nodeData.nodeType === 'nft') {
      // NFT node
      setShowLoadButton(false);
      setSelectedNFT(nodeData);
      setSelectedProfile(null); // Deselect profile node
    } else {
      // Other nodes
      setShowLoadButton(false);
      setSelectedNFT(null);
      setSelectedProfile(null); // Deselect profile node
    }
    
    // Center camera on the clicked node with improved positioning
    if (fgRef.current) {
      const graph = fgRef.current;
      if (graph && typeof graph === 'object' && 'cameraPosition' in graph) {
        // Use a small delay to ensure node positions are stable
        setTimeout(() => {
          // Get the most current node position
          const nodeX = nodeData.x || 0;
          const nodeY = nodeData.y || 0;
          const nodeZ = nodeData.z || 0;
          
          // Calculate optimal camera distance based on node type
          const cameraDistance = nodeData.nodeType === 'profile' ? 60 : 50;
          
          // Calculate camera position that provides a good viewing angle
          const cameraX = nodeX + cameraDistance * 0.7;
          const cameraY = nodeY + cameraDistance * 0.3;
          const cameraZ = nodeZ + cameraDistance * 0.5;
          
          // Smoothly move camera to focus on the node
          graph.cameraPosition(
            { x: cameraX, y: cameraY, z: cameraZ }, // Camera position
            { x: nodeX, y: nodeY, z: nodeZ }, // Look at the node
            1500  // Animation duration
          );
        }, 100); // Small delay to ensure stable positioning
      }
    }
  }, [fgRef]);

  // Memoized link color function
  const getLinkColor = useCallback((link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const linkData = link as LinkData;
    return linkData.linkType === 'profile-to-nft' ? '#ffffff' : '#4CAF50';
  }, []);

  // Memoized node label function
  const getNodeLabel = useCallback((node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
  }, []);

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
      
      // Automatically select the main profile node and load collection
      setTimeout(() => {
        const profileNode = {
          id: 0,
          img: data.profile_image_url,
          username: data.username || 'Unknown User',
          nodeType: 'profile' as const
        };
        setSelectedProfile(profileNode);
        
        // Auto-load the collection directly using the profile address
        loadInitialCollection(data.address);
      }, 500); // Small delay to ensure graph is rendered
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
      const multiOwnershipMap = new Map(multiOwnership);
      const existingNFTsMap = new Map(existingNFTs);
      const profileNodeId = selectedProfile?.id || 0;
      
      // Process each NFT
      const newNFTs: NFTData[] = [];
      data.nfts.forEach((nft) => {
        const nftKey = `${nft.contract}:${nft.identifier}`;
        const existingIndex = existingNFTsMap.get(nftKey);
        
        if (existingIndex !== undefined) {
          // NFT already exists, add this profile as an additional owner
          const owners = multiOwnershipMap.get(existingIndex) || new Set([ownershipMap.get(existingIndex) || 0]);
          owners.add(profileNodeId);
          multiOwnershipMap.set(existingIndex, owners);
        } else {
          // New NFT, add it to the array
          const newIndex = nfts.length + newNFTs.length;
          newNFTs.push(nft);
          ownershipMap.set(newIndex, profileNodeId);
          existingNFTsMap.set(nftKey, newIndex);
          // Initialize multi-ownership with single owner
          multiOwnershipMap.set(newIndex, new Set([profileNodeId]));
        }
      });
      
      // Update state
      setNftOwnership(ownershipMap);
      setMultiOwnership(multiOwnershipMap);
      setExistingNFTs(existingNFTsMap);
      if (newNFTs.length > 0) {
        setNfts(prevNfts => [...prevNfts, ...newNFTs]);
      }
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

  // Handle loading initial NFT collection for main profile (auto-load)
  const loadInitialCollection = async (profileAddress: string) => {
    if (!profileAddress) return;

    setLoadingNFTs(true);
    try {
      const response = await fetch(`/api/opensea/nfts?address=${encodeURIComponent(profileAddress)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch NFTs');
      }

      const data: NFTResponse = await response.json();
      
      // Track which profile owns these NFTs (main profile = node ID 0)
      const ownershipMap = new Map(nftOwnership);
      const multiOwnershipMap = new Map(multiOwnership);
      const existingNFTsMap = new Map(existingNFTs);
      const profileNodeId = 0; // Main profile node ID
      
      // Process each NFT
      const newNFTs: NFTData[] = [];
      data.nfts.forEach((nft) => {
        const nftKey = `${nft.contract}:${nft.identifier}`;
        const existingIndex = existingNFTsMap.get(nftKey);
        
        if (existingIndex !== undefined) {
          // NFT already exists, add this profile as an additional owner
          const owners = multiOwnershipMap.get(existingIndex) || new Set([ownershipMap.get(existingIndex) || 0]);
          owners.add(profileNodeId);
          multiOwnershipMap.set(existingIndex, owners);
        } else {
          // New NFT, add it to the array
          const newIndex = nfts.length + newNFTs.length;
          newNFTs.push(nft);
          ownershipMap.set(newIndex, profileNodeId);
          existingNFTsMap.set(nftKey, newIndex);
          // Initialize multi-ownership with single owner
          multiOwnershipMap.set(newIndex, new Set([profileNodeId]));
        }
      });
      
      // Update state
      setNftOwnership(ownershipMap);
      setMultiOwnership(multiOwnershipMap);
      setExistingNFTs(existingNFTsMap);
      if (newNFTs.length > 0) {
        setNfts(prevNfts => [...prevNfts, ...newNFTs]);
      }
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
      const multiOwnershipMap = new Map(multiOwnership);
      const existingNFTsMap = new Map(existingNFTs);
      const profileNodeId = selectedProfile.id;
      
      // Process each NFT
      const newNFTs: NFTData[] = [];
      data.nfts.forEach((nft) => {
        const nftKey = `${nft.contract}:${nft.identifier}`;
        const existingIndex = existingNFTsMap.get(nftKey);
        
        if (existingIndex !== undefined) {
          // NFT already exists, add this profile as an additional owner
          const owners = multiOwnershipMap.get(existingIndex) || new Set([ownershipMap.get(existingIndex) || 0]);
          owners.add(profileNodeId);
          multiOwnershipMap.set(existingIndex, owners);
        } else {
          // New NFT, add it to the array
          const newIndex = nfts.length + newNFTs.length;
          newNFTs.push(nft);
          ownershipMap.set(newIndex, profileNodeId);
          existingNFTsMap.set(nftKey, newIndex);
          // Initialize multi-ownership with single owner
          multiOwnershipMap.set(newIndex, new Set([profileNodeId]));
        }
      });
      
      // Update state
      setNftOwnership(ownershipMap);
      setMultiOwnership(multiOwnershipMap);
      setExistingNFTs(existingNFTsMap);
      if (newNFTs.length > 0) {
        setNfts(prevNfts => [...prevNfts, ...newNFTs]);
      }
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
    // Set initial camera position closer to the profile when loaded and focus on it
    if (fgRef.current && userProfile && userProfile.profile_image_url) {
      const graph = fgRef.current;
      if (graph && typeof graph === 'object' && 'cameraPosition' in graph) {
        // Zoom to profile node with closer distance
        setTimeout(() => {
          graph.cameraPosition(
            { x: 0, y: 0, z: 15 }, // Much closer to profile
            { x: 0, y: 0, z: 0 },  // Look at profile node
            1500  // ms transition duration
          );
        }, 200); // Small delay to ensure graph is rendered
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
          linkColor={getLinkColor}
          linkOpacity={0.6}
          linkWidth={0.5}
          linkCurvature={0.2}
          nodeRelSize={6}
          enableNodeDrag={true}
          enableNavigationControls={true}
          showNavInfo={true}
          nodeLabel={getNodeLabel}
        />
      )}



            {/* Consolidated Info Card */}
      {(userProfile || selectedProfile || selectedNFT) && (
        <Card className="fixed top-6 left-6 max-w-sm z-20 backdrop-blur-md bg-black/80 border-white/20 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              {selectedNFT ? 
                'NFT Details' : 
                (selectedProfile && selectedProfile.id !== 0 ? 
                  'Collector Profile' : 
                  'Main Profile')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* NFT Information */}
            {selectedNFT && selectedNFT.nodeType === 'nft' ? (
              <div className="space-y-3">
                {/* NFT Name */}
                <div>
                  <p className="text-sm font-semibold text-white">
                    {selectedNFT.username}
                  </p>
                </div>
                
                {/* NFT Details */}
                <div className="space-y-2">
                  {selectedNFT.nftData?.description && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Description:</p>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {selectedNFT.nftData.description.length > 150 
                          ? `${selectedNFT.nftData.description.substring(0, 150)}...` 
                          : selectedNFT.nftData.description}
                      </p>
                    </div>
                  )}
                  
                  {selectedNFT.nftData?.contract && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Contract:</p>
                      <div className="bg-white/10 p-2 rounded-md">
                        <p className="text-xs font-mono text-gray-300 break-all">
                          {selectedNFT.nftData.contract}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {selectedNFT.nftData?.opensea_url && (
                    <div>
                      <a 
                        href={selectedNFT.nftData.opensea_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <span>View on OpenSea</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
                
                {/* Collectors Section */}
                <div className="pt-3 border-t border-white/20">
                  <p className="text-xs text-gray-400 mb-2">Collectors:</p>
                  {collectors.has(selectedNFT.id.toString()) ? (
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
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400">
                        Click to load collectors for this NFT
                      </p>
                      <Button
                        onClick={loadCollectors}
                        disabled={loadingCollectors}
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700"
                      >
                        {loadingCollectors ? 'Loading Collectors...' : 'Load Collectors'}
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* Collection Overview */}
                <div className="pt-3 border-t border-white/20">
                  <p className="text-xs text-gray-400 mb-2">Collection Overview:</p>
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                    Total: {nfts.length} NFTs loaded
                  </Badge>
                </div>
              </div>
            ) : (
              /* Profile Information */
              selectedProfile ? (
                <div className="space-y-3">
                  {/* Profile Name */}
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {selectedProfile.id === 0 ? 
                        (userProfile?.username || 'Unknown User') : 
                        (selectedProfile.username || 'Unknown Collector')}
                    </p>
                  </div>
                  
                  {/* Address */}
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Address:</p>
                    <div className="bg-white/10 p-2 rounded-md">
                      <p className="text-xs font-mono break-all text-gray-300">
                        {selectedProfile.id === 0 ? 
                          (userProfile?.address || 'No address') : 
                          (selectedProfile.contract || 'No address')}
                      </p>
                    </div>
                  </div>
                  
                  {/* Main Profile Details */}
                  {selectedProfile.id === 0 && userProfile && (
                    <>
                      {userProfile.bio && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Bio:</p>
                          <p className="text-sm text-gray-300 leading-relaxed">
                            {userProfile.bio}
                          </p>
                        </div>
                      )}
                      
                      {userProfile.website && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Website:</p>
                          <a 
                            href={userProfile.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors break-all"
                          >
                            {userProfile.website}
                          </a>
                        </div>
                      )}
                      
                      {userProfile.joined_date && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Joined:</p>
                          <p className="text-xs text-gray-300">
                            {new Date(userProfile.joined_date).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Collector Profile Details */}
                  {selectedProfile.id !== 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Profile Type:</p>
                      <Badge variant="secondary" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        NFT Collector
                      </Badge>
                    </div>
                  )}
                  
                  {/* Collection Status */}
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Collection Status:</p>
                    {selectedProfile.id === 0 ? (
                      nfts.length > 0 ? (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                          {nfts.length} NFTs loaded
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                          No NFTs loaded
                        </Badge>
                      )
                    ) : (
                      <Badge variant="secondary" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                        Click &quot;Load Collection&quot; to explore
                      </Badge>
                    )}
                  </div>
                  
                  {/* Load Collection Button - only show if collector has no NFTs loaded yet */}
                  {showLoadButton && (selectedProfile.id === 0 || !Array.from(nftOwnership.values()).includes(selectedProfile.id)) && (
                    <div className="pt-2">
                      <Button
                        onClick={loadCollection}
                        disabled={loadingNFTs}
                        variant="destructive"
                        size="sm"
                        className="w-full"
                      >
                        {loadingNFTs ? 'Loading NFTs...' : `Load ${selectedProfile.id === 0 ? '' : 'Collector\'s '}Collection`}
                      </Button>
                    </div>
                  )}
                  
                  {/* Load More NFTs button - only show when no NFT is selected and collector has NFTs loaded */}
                  {!selectedNFT && hasMoreNFTs && (
                    selectedProfile.id === 0 || Array.from(nftOwnership.values()).includes(selectedProfile.id)
                  ) && (
                    <div className="pt-2">
                      <Button
                        onClick={loadMoreNFTs}
                        disabled={loadingNFTs}
                        size="sm"
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        {loadingNFTs ? 'Loading...' : 'Load More NFTs'}
                      </Button>
                    </div>
                  )}
                  
                  {/* Action Hint */}
                  <div className="pt-2 border-t border-white/20">
                    <p className="text-xs text-gray-400 italic">
                      {selectedProfile.id === 0 ? 
                        "This is the main profile you searched for" : 
                        "This collector was discovered through NFT ownership"}
                    </p>
                  </div>
                </div>
              ) : (
                /* Fallback for when no profile is selected */
                <div className="space-y-3">
                  <div className="bg-white/10 p-2 rounded-md">
                    <p className="text-xs font-mono break-all text-gray-300">
                      {userProfile?.address || 'No address'}
                    </p>
                  </div>
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
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
