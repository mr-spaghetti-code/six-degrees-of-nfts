'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Mouse, 
  Zap, 
  Search, 
  AlertCircle, 
  Network, 
  User, 
  Users, 
  Image as ImageIcon, 
  ExternalLink, 
  Calendar, 
  Globe, 
  FileText, 
  Code, 
  Package, 
  ChevronDown,
  ChevronUp,
  Hash,
  Sparkles,
  Info,
  Heart,
  Settings,
  RotateCcw
} from 'lucide-react';

// Dynamically import ForceGraph3D to avoid SSR issues
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
});

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
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
  const textureCache = useRef<Map<string, THREE.Texture | HTMLCanvasElement | HTMLImageElement>>(new Map()); // Cache for loaded textures
  const [showModal, setShowModal] = useState(true);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
  const [showArtworkModal, setShowArtworkModal] = useState(false);

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

  // Add collapsible card state
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);

  // Contract expansion state
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set()); // Track which contracts have been expanded
  const [loadingContract, setLoadingContract] = useState(false);
  const [contractNFTs, setContractNFTs] = useState<Map<string, string[]>>(new Map()); // Contract -> NFT IDs that were added from expansion
  const [contractPagination, setContractPagination] = useState<Map<string, { next: string | null; hasMore: boolean }>>(new Map()); // Contract -> pagination info

  // Settings state
  const [nftFetchLimit, setNftFetchLimit] = useState(10); // Default 10 NFTs
  const [collectorFetchLimit, setCollectorFetchLimit] = useState(5); // Default 5 collectors
  const [contractExpandLimit, setContractExpandLimit] = useState(10);
  const [linkTransparency, setLinkTransparency] = useState(0.6); // Default 60% transparency // Default 10 NFTs for contract expansion
  const [is3DMode, setIs3DMode] = useState(true); // Default to 3D mode
  const [selectedBackground, setSelectedBackground] = useState(0); // Default to first background

  // Background gradient options
  const backgroundOptions = [
    { name: 'Vibrant', gradient: 'from-blue-500 to-purple-600' },
    { name: 'Deep Ocean', gradient: 'from-blue-900 to-indigo-900' },
    { name: 'Sunset', gradient: 'from-orange-500 to-pink-600' },
    { name: 'Dark Mode', gradient: 'from-gray-900 to-black' }
  ];

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
      ...nfts.flatMap((nft, index) => {
        // Check if this NFT was added through contract expansion
        const nftKey = `${nft.contract}:${nft.identifier}`;
        const isFromContractExpansion = Array.from(contractNFTs.values()).some(nftIds => nftIds.includes(nftKey));
        
        // Only create ownership links if we know the owner (not from contract expansion)
        if (isFromContractExpansion) {
          return []; // No ownership links for contract-expanded NFTs
        }
        
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
  }), [userProfile, nfts, collectorProfiles, collectors, nftOwnership, multiOwnership, contractNFTs]);

  // Create 3D object for each node using the image as a texture - memoized for stability
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createNodeThreeObject = useCallback((node: any) => { // ForceGraph3D library requires any type
    const nodeData = node as NodeData;
    const cache = textureCache.current;
    
    // For profile nodes, create circular cropped images
    if (nodeData.nodeType === 'profile') {
      const baseSize = 25;
      const sprite = new THREE.Sprite();
      
      // Check cache first
      const cacheKey = `profile-${nodeData.img}`;
      const cachedCanvas = cache.get(cacheKey) as HTMLCanvasElement;
      
      if (cachedCanvas) {
        // Use cached circular canvas
        const texture = new THREE.CanvasTexture(cachedCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        sprite.material = new THREE.SpriteMaterial({ 
          map: texture,
          transparent: true
        });
        sprite.scale.set(baseSize, baseSize, 1);
      } else {
        // Load image and create circular crop
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // Create canvas for circular crop
          const canvas = document.createElement('canvas');
          const size = 256; // Canvas size for good quality
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Create circular clipping path
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            
            // Draw image centered and scaled to fill circle
            const aspectRatio = img.width / img.height;
            let drawWidth = size;
            let drawHeight = size;
            let offsetX = 0;
            let offsetY = 0;
            
            if (aspectRatio > 1) {
              // Landscape - fit height, crop width
              drawHeight = size;
              drawWidth = size * aspectRatio;
              offsetX = -(drawWidth - size) / 2;
            } else {
              // Portrait - fit width, crop height
              drawWidth = size;
              drawHeight = size / aspectRatio;
              offsetY = -(drawHeight - size) / 2;
            }
            
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
            
            // Cache the canvas
            cache.set(cacheKey, canvas);
            
            // Create texture from canvas
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
            
            // Apply texture to sprite
            sprite.material = new THREE.SpriteMaterial({ 
              map: texture,
              transparent: true
            });
            sprite.scale.set(baseSize, baseSize, 1);
          }
        };
        img.src = nodeData.img;
      }
      
      // Set initial scale
      sprite.scale.set(baseSize, baseSize, 1);
      
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
      // NFT nodes - keep original aspect ratio
      const cacheKey = `nft-${nodeData.img}`;
      const cachedTexture = cache.get(cacheKey) as THREE.Texture;
      
      if (cachedTexture) {
        // Use cached texture
        const material = new THREE.SpriteMaterial({ map: cachedTexture });
        const sprite = new THREE.Sprite(material);
        
        // Apply cached aspect ratio if available
        if (cachedTexture.image) {
          const aspectRatio = cachedTexture.image.width / cachedTexture.image.height;
          const baseSize = 15;
          
          if (aspectRatio > 1) {
            sprite.scale.set(baseSize * aspectRatio, baseSize, 1);
          } else {
            sprite.scale.set(baseSize, baseSize / aspectRatio, 1);
          }
        } else {
          sprite.scale.set(15, 15, 1);
        }
        
        return sprite;
      } else {
        // Load new texture
        const imgTexture = new THREE.TextureLoader().load(nodeData.img);
        imgTexture.colorSpace = THREE.SRGBColorSpace;
        
        // Cache the texture
        cache.set(cacheKey, imgTexture);
        
        const material = new THREE.SpriteMaterial({ map: imgTexture });
        const sprite = new THREE.Sprite(material);
        
        // Set up proper aspect ratio when texture loads
        imgTexture.onUpdate = () => {
          if (imgTexture.image) {
            const aspectRatio = imgTexture.image.width / imgTexture.image.height;
            const baseSize = 15;
            
            if (aspectRatio > 1) {
              // Landscape image
              sprite.scale.set(baseSize * aspectRatio, baseSize, 1);
            } else {
              // Portrait or square image
              sprite.scale.set(baseSize, baseSize / aspectRatio, 1);
            }
          }
        };
        
        // Set initial scale
        sprite.scale.set(15, 15, 1);
        
        return sprite;
      }
    }
  }, []);

  // Create 2D object for each node using Canvas API - memoized for stability
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createNode2DObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const nodeData = node as NodeData;
    const cache = textureCache.current;
    
    // For profile nodes, create circular images
    if (nodeData.nodeType === 'profile') {
      const size = 25 * globalScale;
      const cacheKey = `profile-${nodeData.img}`;
      
      // Check if we have a cached canvas for circular profile
      const cachedCanvas = cache.get(cacheKey) as HTMLCanvasElement;
      
      if (cachedCanvas) {
        // Draw cached circular image
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, size / 2, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(cachedCanvas, node.x - size / 2, node.y - size / 2, size, size);
        ctx.restore();
        
        // Add glow effect for profile nodes
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(node.x, node.y, size / 2 + 3, 0, 2 * Math.PI);
        ctx.fillStyle = nodeData.id === 0 ? '#00aaff' : '#9C27B0';
        ctx.fill();
        ctx.restore();
      } else {
        // Load and cache the image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // Create circular canvas
          const canvas = document.createElement('canvas');
          const canvasSize = 256;
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          const imgCtx = canvas.getContext('2d');
          
          if (imgCtx) {
            // Create circular clipping path
            imgCtx.beginPath();
            imgCtx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
            imgCtx.closePath();
            imgCtx.clip();
            
            // Draw image centered and scaled to fill circle
            const aspectRatio = img.width / img.height;
            let drawWidth = canvasSize;
            let drawHeight = canvasSize;
            let offsetX = 0;
            let offsetY = 0;
            
            if (aspectRatio > 1) {
              drawHeight = canvasSize;
              drawWidth = canvasSize * aspectRatio;
              offsetX = -(drawWidth - canvasSize) / 2;
            } else {
              drawWidth = canvasSize;
              drawHeight = canvasSize / aspectRatio;
              offsetY = -(drawHeight - canvasSize) / 2;
            }
            
            imgCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
            
            // Cache the canvas
            cache.set(cacheKey, canvas);
          }
        };
        img.src = nodeData.img;
        
        // Draw placeholder circle while loading
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, size / 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#333';
        ctx.fill();
        ctx.restore();
      }
    } else {
      // NFT nodes - rectangular with aspect ratio
      const baseSize = 15 * globalScale;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      const cacheKey = `nft-2d-${nodeData.img}`;
      const cachedItem = cache.get(cacheKey);
      
      if (cachedItem && cachedItem instanceof HTMLImageElement && cachedItem.complete) {
        // Use cached image
        const aspectRatio = cachedItem.width / cachedItem.height;
        let width = baseSize;
        let height = baseSize;
        
        if (aspectRatio > 1) {
          width = baseSize * aspectRatio;
        } else {
          height = baseSize / aspectRatio;
        }
        
        ctx.drawImage(cachedItem, node.x - width / 2, node.y - height / 2, width, height);
      } else {
        // Load new image
        img.onload = () => {
          cache.set(cacheKey, img);
        };
        img.src = nodeData.img;
        
        // Draw placeholder rectangle while loading
        ctx.fillStyle = '#666';
        ctx.fillRect(node.x - baseSize / 2, node.y - baseSize / 2, baseSize, baseSize);
      }
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
      setShowArtworkModal(false); // Close artwork modal when selecting profile
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
      setShowArtworkModal(false); // Close artwork modal when deselecting
    }
    
    // Center camera on the clicked node with improved positioning
    if (fgRef.current) {
      const graph = fgRef.current;
      
      // Use a small delay to ensure node positions are stable
      setTimeout(() => {
        // Get the most current node position
        const nodeX = nodeData.x || 0;
        const nodeY = nodeData.y || 0;
        const nodeZ = nodeData.z || 0;
        
        if (is3DMode && graph && typeof graph === 'object' && 'cameraPosition' in graph) {
          // 3D mode camera positioning
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
        } else if (!is3DMode && graph && typeof graph === 'object' && 'centerAt' in graph) {
          // 2D mode camera positioning
          graph.centerAt(nodeX, nodeY, 1000); // Center at node position with 1s animation
          
          // Also zoom in slightly when clicking a node
          if ('zoom' in graph) {
            const currentZoom = graph.zoom();
            graph.zoom(currentZoom * 1.5, 1000);
          }
        }
      }, 100); // Small delay to ensure stable positioning
    }
  }, [fgRef, is3DMode]);

  // Memoized link color function
  const getLinkColor = useCallback((link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const linkData = link as LinkData;
    return linkData.linkType === 'profile-to-nft' ? '#ffffff' : '#4CAF50';
  }, []);

  // Memoized node label function with prettier formatting
  const getNodeLabel = useCallback((node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const nodeData = node as NodeData;
    
    if (nodeData.nodeType === 'profile') {
      if (nodeData.id === 0) {
        // Main profile node
        return [
          '👤 MAIN PROFILE',
          '━━━━━━━━━━━━━━━━━━━',
          `Name: ${nodeData.username || 'Unknown User'}`,
          '',
          '💡 Click to load collection'
        ].join('<br/>');
      } else {
        // Collector profile node
        const address = nodeData.contract || '';
        const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown';
        
        return [
          '🏛️ COLLECTOR PROFILE',
          '━━━━━━━━━━━━━━━━━━━',
          `Name: ${nodeData.username || 'Unknown'}`,
          `Address: ${shortAddress}`,
          '',
          '💡 Click to load collection'
        ].join('<br/>');
      }
    } else {
      // NFT node
      const nft = nodeData.nftData;
      const collection = nft?.collection || 'Unknown Collection';
      const description = nft?.description ? 
        (nft.description.length > 80 ? 
          `${nft.description.substring(0, 80)}...` : 
          nft.description) : 
        'No description';
      const contractShort = nodeData.contract ? 
        `${nodeData.contract.slice(0, 6)}...${nodeData.contract.slice(-4)}` : 
        'Unknown';
      
      return [
        '🖼️ NFT',
        '━━━━━━━━━━━━━━━━━━━',
        `Name: ${nodeData.username || 'Unnamed NFT'}`,
        `Collection: ${collection}`,
        '',
        `📝 ${description}`,
        '',
        `📄 Contract: ${contractShort}`,
        '',
        '💡 Click for details'
      ].join('<br/>');
    }
  }, []);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) {
      setError('Please enter an Ethereum address');
      return;
    }

    await loadProfile(address.trim());
  };

  // Load profile by address (used by both form submission and example wallets)
  const loadProfile = async (walletAddress: string) => {
    setLoading(true);
    setError('');

    try {
      // Call our internal API route instead of OpenSea directly
      const response = await fetch(`/api/opensea?address=${encodeURIComponent(walletAddress)}`);
      
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

  // Handle reset - clear everything and show address modal
  const handleReset = () => {
    // Clear all state
    setAddress('');
    setUserProfile(null);
    setNfts([]);
    setCollectors(new Map());
    setCollectorProfiles(new Map());
    setSelectedProfile(null);
    setSelectedNFT(null);
    setNftOwnership(new Map());
    setFilteredDuplicates(new Map());
    setCollectorPagination(new Map());
    setExistingNFTs(new Map());
    setMultiOwnership(new Map());
    setExpandedContracts(new Set());
    setContractNFTs(new Map());
    setContractPagination(new Map());
    setNextToken(null);
    setHasMoreNFTs(false);
    setError('');
    setShowLoadButton(false);
    setIs3DMode(true); // Reset to default 3D mode
    setSelectedBackground(0); // Reset to default background
    
    // Clear texture cache
    const cache = textureCache.current;
    cache.forEach((value) => {
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    });
    cache.clear();
    
    // Close settings modal and show address modal
    setShowSettingsModal(false);
    setShowModal(true);
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
      const response = await fetch(`/api/opensea/nfts?address=${encodeURIComponent(profileAddress)}&limit=${nftFetchLimit}`);
      
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
      
      // Recenter camera on selected node in 2D mode
      recenterOnSelectedNode();
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
      const response = await fetch(`/api/opensea/nfts?address=${encodeURIComponent(profileAddress)}&limit=${nftFetchLimit}`);
      
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
      
      // Recenter camera on selected node in 2D mode
      recenterOnSelectedNode();
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
      const response = await fetch(`/api/opensea/nfts?address=${encodeURIComponent(profileAddress)}&next=${encodeURIComponent(nextToken)}&limit=${nftFetchLimit}`);
      
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
      
      // Recenter camera on selected node in 2D mode
      recenterOnSelectedNode();
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
      
      // Fetch collectors from Moralis with cursor-based pagination
      const response = await fetch(`/api/moralis/collectors?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(identifier)}&limit=${collectorFetchLimit}`);
      
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
      
      // Recenter camera on selected node in 2D mode
      recenterOnSelectedNode();
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
      const url = `/api/moralis/collectors?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(identifier)}&limit=${collectorFetchLimit}${pagination.cursor ? `&cursor=${encodeURIComponent(pagination.cursor)}` : ''}`;
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
      
      // Recenter camera on selected node in 2D mode
      recenterOnSelectedNode();
    } catch (err) {
      console.error('Error loading more collectors:', err);
      setError('Failed to load more collectors. Please try again.');
    } finally {
      setLoadingMoreCollectors(false);
    }
  };

  // Handle loading NFTs from the same contract
  const loadContractNFTs = async (loadMore = false) => {
    if (!selectedNFT || !selectedNFT.nftData) return;

    const contract = selectedNFT.nftData.contract;
    if (!contract) return;

    // Check if we're loading more and have a next cursor
    const pagination = contractPagination.get(contract);
    if (loadMore && (!pagination || !pagination.hasMore)) return;

    setLoadingContract(true);
    try {
      let url = `/api/opensea/contract?contract=${encodeURIComponent(contract)}&limit=${contractExpandLimit}`;
      
      // Add pagination cursor if loading more
      if (loadMore && pagination?.next) {
        url += `&next=${encodeURIComponent(pagination.next)}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch NFTs from contract');
      }

      const data: NFTResponse = await response.json();
      
      // Track which NFTs are added from this contract expansion
      const existingNFTsMap = new Map(existingNFTs);
      const currentContractNFTs = contractNFTs.get(contract) || [];
      const newNFTIds: string[] = [...currentContractNFTs];
      const newNFTs: NFTData[] = [];
      let duplicatesCount = 0;
      
      // Process each NFT from the contract
      data.nfts.forEach((nft) => {
        const nftKey = `${nft.contract}:${nft.identifier}`;
        
        // Only add if it doesn't already exist
        if (!existingNFTsMap.has(nftKey)) {
          const newIndex = nfts.length + newNFTs.length;
          newNFTs.push(nft);
          existingNFTsMap.set(nftKey, newIndex);
          newNFTIds.push(nftKey);
        } else {
          duplicatesCount++;
        }
      });
      
      // Update state
      setExistingNFTs(existingNFTsMap);
      if (newNFTs.length > 0) {
        setNfts(prevNfts => [...prevNfts, ...newNFTs]);
      }
      
      // Update pagination info
      setContractPagination(prev => new Map(prev).set(contract, {
        next: data.next || null,
        hasMore: !!data.next
      }));
      
      // Track this contract as expanded and update NFT list
      setExpandedContracts(prev => new Set(prev).add(contract));
      setContractNFTs(prev => new Map(prev).set(contract, newNFTIds));
      
      console.log(`Added ${newNFTs.length} new NFTs from contract ${contract} (${duplicatesCount} duplicates filtered)`);
      
      // Recenter camera on selected node in 2D mode
      recenterOnSelectedNode();
    } catch (err) {
      console.error('Error loading NFTs from contract:', err);
      setError('Failed to load NFTs from contract. Please try again.');
    } finally {
      setLoadingContract(false);
    }
  };

  // Clear cache when it gets too large
  useEffect(() => {
    const checkCacheSize = () => {
      const cache = textureCache.current;
      const maxCacheSize = 100; // Maximum number of cached items
      
      if (cache.size > maxCacheSize) {
        // Clear oldest entries (first half of the cache)
        const entriesToDelete = Math.floor(cache.size / 2);
        const keys = Array.from(cache.keys());
        for (let i = 0; i < entriesToDelete; i++) {
          const texture = cache.get(keys[i]);
          // Dispose of THREE.js textures to free GPU memory
          if (texture && texture instanceof THREE.Texture) {
            texture.dispose();
          }
          cache.delete(keys[i]);
        }
        console.log(`Cleared ${entriesToDelete} entries from texture cache`);
      }
    };
    
    // Check cache size periodically
    const interval = setInterval(checkCacheSize, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Helper function to recenter camera on selected node after graph updates
  const recenterOnSelectedNode = useCallback(() => {
    if (!fgRef.current || is3DMode) return;
    
    // Determine which node to center on
    let targetNode: NodeData | null = null;
    if (selectedNFT) {
      targetNode = selectedNFT;
    } else if (selectedProfile) {
      targetNode = selectedProfile;
    }
    
    if (!targetNode) return;
    
    // Use a timeout to ensure the force simulation has stabilized
    setTimeout(() => {
      const graph = fgRef.current;
      if (!graph || typeof graph !== 'object' || !('centerAt' in graph)) return;
      
      // Find the actual node in the graph data to get its current position
      const nodeInGraph = gData.nodes.find(n => n.id === targetNode!.id) as NodeData | undefined;
      if (!nodeInGraph) return;
      
      // Get the current position (might be updated by force simulation)
      const nodeX = nodeInGraph.x || 0;
      const nodeY = nodeInGraph.y || 0;
      
      // Smoothly recenter on the node
      graph.centerAt(nodeX, nodeY, 800);
    }, 500); // Wait for force simulation to stabilize
  }, [selectedNFT, selectedProfile, is3DMode, gData]);

  // Clean up cache on unmount
  useEffect(() => {
    const cache = textureCache.current;
    return () => {
      // Dispose of all THREE.js textures
      cache.forEach((value) => {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      });
      cache.clear();
    };
  }, []);

  useEffect(() => {
    // Set initial camera position closer to the profile when loaded and focus on it
    if (fgRef.current && userProfile && userProfile.profile_image_url) {
      const graph = fgRef.current;
      
      setTimeout(() => {
        if (is3DMode && graph && typeof graph === 'object' && 'cameraPosition' in graph) {
          // 3D mode: Zoom to profile node with reasonable distance
          graph.cameraPosition(
            { x: 40, y: 30, z: 60 }, // More distant view to see the graph better
            { x: 0, y: 0, z: 0 },  // Look at profile node
            1500  // ms transition duration
          );
        } else if (!is3DMode && graph && typeof graph === 'object' && 'centerAt' in graph) {
          // 2D mode: Center on profile node
          graph.centerAt(0, 0, 1500);
          
          // Set initial zoom level
          if ('zoom' in graph) {
            graph.zoom(2, 1500);
          }
        }
      }, 200); // Small delay to ensure graph is rendered
    }
  }, [userProfile, is3DMode]);

  // Configure 2D force simulation for better node spacing
  useEffect(() => {
    if (!is3DMode) {
      // Use a timeout to ensure the graph is fully initialized
      const timer = setTimeout(() => {
        if (fgRef.current) {
          const fg = fgRef.current;
          
          // Access the force simulation
          if (fg.d3Force) {
            // Increase repulsion between nodes
            fg.d3Force('charge').strength(-200);
            
            // Increase link distance
            fg.d3Force('link').distance(100);
            
            // Reheat the simulation to apply changes
            if (fg.d3ReheatSimulation) {
              fg.d3ReheatSimulation();
            }
          }
        }
      }, 300); // Small delay to ensure graph is ready
      
      return () => clearTimeout(timer);
    }
  }, [is3DMode, gData]);

  return (
    <div className={`w-screen h-screen m-0 p-0 overflow-hidden bg-gradient-to-br ${backgroundOptions[selectedBackground].gradient}`}>
      {/* Top Right Buttons */}
      <div className="fixed top-6 right-6 z-30 flex gap-2 flex-wrap">
        <Button
          onClick={() => setIs3DMode(!is3DMode)}
          variant="secondary"
          size="sm"
          className="bg-black/70 hover:bg-black/80 text-white border-white/20 text-xs sm:text-sm"
        >
          {is3DMode ? (
            <>
              <Package className="w-4 h-4 mr-1 sm:mr-2" />
              <span>3D</span>
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-1 sm:mr-2" />
              <span>2D</span>
            </>
          )}
        </Button>
        <Button
          onClick={() => setShowSettingsModal(true)}
          variant="secondary"
          size="sm"
          className="bg-black/70 hover:bg-black/80 text-white border-white/20 text-xs sm:text-sm"
        >
          <Settings className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
        <Button
          onClick={() => setShowAboutModal(true)}
          variant="secondary"
          size="sm"
          className="bg-black/70 hover:bg-black/80 text-white border-white/20 text-xs sm:text-sm"
        >
          <Info className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">About</span>
        </Button>
        <Button
          onClick={handleReset}
          variant="secondary"
          size="sm"
          className="bg-red-900/70 hover:bg-red-900/80 text-white border-red-500/20 text-xs sm:text-sm"
        >
          <RotateCcw className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Reset</span>
        </Button>
      </div>

      {/* Settings Modal */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
              <Settings className="w-6 h-6 text-blue-600" />
              Settings
            </DialogTitle>
            <DialogDescription className="text-base">
              Configure how many items to fetch
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="nft-limit" className="text-sm font-medium text-gray-700">
                NFTs per fetch (max 25)
              </label>
              <Input
                id="nft-limit"
                type="number"
                min="1"
                max="25"
                value={nftFetchLimit}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (value >= 1 && value <= 25) {
                    setNftFetchLimit(value);
                  }
                }}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="collector-limit" className="text-sm font-medium text-gray-700">
                Collectors per fetch (max 25)
              </label>
              <Input
                id="collector-limit"
                type="number"
                min="1"
                max="25"
                value={collectorFetchLimit}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (value >= 1 && value <= 25) {
                    setCollectorFetchLimit(value);
                  }
                }}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="contract-expand-limit" className="text-sm font-medium text-gray-700">
                NFTs per contract expansion (max 25)
              </label>
              <Input
                id="contract-expand-limit"
                type="number"
                min="1"
                max="25"
                value={contractExpandLimit}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (value >= 1 && value <= 25) {
                    setContractExpandLimit(value);
                  }
                }}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="link-transparency" className="text-sm font-medium text-gray-700">
                Link Opacity ({Math.round(linkTransparency * 100)}%)
              </label>
              <Input
                id="link-transparency"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={linkTransparency}
                onChange={(e) => setLinkTransparency(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Background Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                {backgroundOptions.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedBackground(index)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      selectedBackground === index
                        ? 'border-blue-500 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-full h-8 rounded bg-gradient-to-br ${option.gradient} mb-2`} />
                    <p className="text-xs font-medium text-gray-700">{option.name}</p>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-200">
              <Button
                onClick={handleReset}
                variant="destructive"
                className="w-full"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset & Start Over
              </Button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                This will clear all data and return to the address input
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Artwork Modal */}
      <Dialog open={showArtworkModal} onOpenChange={setShowArtworkModal}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ImageIcon className="w-5 h-5" />
              {selectedNFT?.username || 'NFT Artwork'}
            </DialogTitle>
          </DialogHeader>
          <div className="relative w-full flex flex-col gap-4">
            <div className="relative w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden p-4">
              {selectedNFT?.nftData?.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={selectedNFT.nftData.image_url} 
                  alt={selectedNFT.username || 'NFT Artwork'}
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                  loading="lazy"
                />
              )}
            </div>
            {selectedNFT?.nftData?.collection && (
              <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Collection: {selectedNFT.nftData.collection}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* About Modal */}
      <Dialog open={showAboutModal} onOpenChange={setShowAboutModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
              <Network className="w-6 h-6 text-blue-600" />
              About Six Degrees of Art
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600 italic">
              In digital art, everything is connected.
            </p>
            <p className="text-gray-600">
              This is a way to discover new art and see who else was drawn to the same pieces.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                <span className="font-semibold">Powered by:</span> OpenSea and Moralis APIs
              </p>
              <p className="text-sm text-gray-500">
                <span className="font-semibold">Network:</span> Ethereum only
              </p>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 flex items-center gap-2">
                Built with <Heart className="w-4 h-4 text-red-500" /> by{' '}
                <a 
                  href="https://www.x.com/jay_wooow" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline inline-flex items-center gap-1"
                >
                  jay_wooow
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <p className="text-sm text-gray-600 mt-3 text-center">
                Want to say thanks? Send art or tip me at <span className="font-mono font-semibold text-purple-600">jaywooow.eth</span>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal using shadcn Dialog */}
      <Dialog open={showModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
              <Network className="w-6 h-6 text-blue-600" />
              Six Degrees of Art
            </DialogTitle>
            <DialogDescription className="text-base">
              Discover and visualize NFT collections in 2D or 3D space
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter Ethereum address or OpenSea username"
                disabled={loading}
                className="w-full"
              />
            </div>
            {error && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-4 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
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
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Explore Profile
                </>
              )}
            </Button>
          </form>
          
          {/* Example Wallets */}
          <div className="mt-6 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Or try an example</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              {/* VincentVanDough */}
              <button
                onClick={() => {
                  setAddress('0x0f0eae91990140c560d4156db4f00c854dc8f09e');
                  loadProfile('0x0f0eae91990140c560d4156db4f00c854dc8f09e');
                }}
                disabled={loading}
                type="button"
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src="/vvd.png" 
                  alt="VincentVanDough" 
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">VincentVanDough</p>
                  <p className="text-xs text-gray-500">0x0f0e...f09e</p>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </button>
              
              {/* Cozomo de Medici */}
              <button
                onClick={() => {
                  setAddress('0xce90a7949bb78892f159f428d0dc23a8e3584d75');
                  loadProfile('0xce90a7949bb78892f159f428d0dc23a8e3584d75');
                }}
                disabled={loading}
                type="button"
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src="/cozomo.jpeg" 
                  alt="Cozomo de Medici" 
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Cozomo de Medici</p>
                  <p className="text-xs text-gray-500">0xce90...4d75</p>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </button>
              
              {/* DCInvestor */}
              <button
                onClick={() => {
                  setAddress('0x59a5493513ba2378ed57ae5ecfb8a027e9d80365');
                  loadProfile('0x59a5493513ba2378ed57ae5ecfb8a027e9d80365');
                }}
                disabled={loading}
                type="button"
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src="/dc.png" 
                  alt="DCInvestor" 
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">DCInvestor</p>
                  <p className="text-xs text-gray-500">0x59a5...0365</p>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Graph Visualization (2D or 3D) */}
      {userProfile && userProfile.profile_image_url && (
        is3DMode ? (
          <ForceGraph3D
            ref={fgRef}
            graphData={gData}
            nodeThreeObject={createNodeThreeObject}
            onNodeClick={handleClick}
            width={typeof window !== 'undefined' ? window.innerWidth : 800}
            height={typeof window !== 'undefined' ? window.innerHeight : 600}
            backgroundColor="rgba(0,0,0,0)"
            linkColor={getLinkColor}
            linkOpacity={linkTransparency}
            linkWidth={0.5}
            linkCurvature={0.2}
            nodeRelSize={6}
            enableNodeDrag={true}
            enableNavigationControls={true}
            showNavInfo={false}
            nodeLabel={getNodeLabel}
          />
        ) : (
          <ForceGraph2D
            ref={fgRef}
            graphData={gData}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={createNode2DObject}
            onNodeClick={handleClick}
            width={typeof window !== 'undefined' ? window.innerWidth : 800}
            height={typeof window !== 'undefined' ? window.innerHeight : 600}
            backgroundColor="rgba(0,0,0,0)"
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            warmupTicks={100}
            cooldownTicks={200}
            onEngineStop={() => {
              // Ensure forces are configured when engine first stops
              if (fgRef.current && fgRef.current.d3Force) {
                fgRef.current.d3Force('charge').strength(-400);
                fgRef.current.d3Force('link').distance(120);
              }
            }}
            linkCanvasObjectMode={() => 'replace'}
            linkCanvasObject={(link, ctx, globalScale) => {
              const linkData = link as LinkData;
              const color = linkData.linkType === 'profile-to-nft' ? '#ffffff' : '#4CAF50';
              
              ctx.save();
              ctx.globalAlpha = linkTransparency;
              ctx.strokeStyle = color;
              ctx.lineWidth = 0.5 * globalScale;
              
              // Draw curved link
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const start = link.source as any;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const end = link.target as any;
              const dx = end.x - start.x;
              const dy = end.y - start.y;
              const l = Math.sqrt(dx * dx + dy * dy);
              const unitX = dx / l;
              const unitY = dy / l;
              const perpX = -unitY;
              const perpY = unitX;
              const curvature = 0.2;
              const curveX = (start.x + end.x) / 2 + perpX * l * curvature;
              const curveY = (start.y + end.y) / 2 + perpY * l * curvature;
              
              ctx.beginPath();
              ctx.moveTo(start.x, start.y);
              ctx.quadraticCurveTo(curveX, curveY, end.x, end.y);
              ctx.stroke();
              ctx.restore();
            }}
            nodeRelSize={8}
            enableNodeDrag={true}
            enablePanInteraction={true}
            enableZoomInteraction={true}
            nodeLabel={getNodeLabel}
            nodeVal={node => {
              const nodeData = node as NodeData;
              return nodeData.nodeType === 'profile' ? 20 : 10;
            }}
            linkDirectionalParticles={0}
          />
        )
      )}



            {/* Navigation Instructions Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 backdrop-blur-md bg-black/70 border-t border-white/20 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-6 text-sm text-gray-300">
          <div className="flex items-center gap-2">
            <Mouse className="w-4 h-4 text-gray-400" />
            <span>{is3DMode ? 'Left-click + drag to rotate' : 'Left-click + drag to pan'}</span>
          </div>
          {is3DMode && (
            <div className="hidden sm:flex items-center gap-2">
              <Mouse className="w-4 h-4 text-gray-400" />
              <span>Right-click + drag to pan</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gray-400" />
            <span>Click nodes to explore</span>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <span>Scroll to zoom</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={`text-xs ${is3DMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
              {is3DMode ? '3D' : '2D'} Mode
            </Badge>
          </div>
        </div>
      </div>

      {/* Consolidated Info Card */}
      {(userProfile || selectedProfile || selectedNFT) && (
        <Card className={`fixed top-6 left-6 ${isCardCollapsed ? 'w-auto min-w-[200px] max-w-[200px]' : 'max-w-[280px] sm:max-w-sm w-full sm:w-auto'} z-20 backdrop-blur-md bg-black/80 border-white/20 text-white`}>
          <CardHeader className={`${isCardCollapsed ? 'pb-3' : 'pb-3'}`}>
            <CardTitle className="text-lg flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                                  {selectedNFT ? (
                    <>
                      <ImageIcon className="w-5 h-5 flex-shrink-0" />
                      <span className="min-w-0">NFT Details</span>
                    </>
                  ) : (selectedProfile && selectedProfile.id !== 0 ? (
                    <>
                      <Users className="w-5 h-5 flex-shrink-0" />
                      <span className="min-w-0">Collector Profile</span>
                    </>
                  ) : (
                    <>
                      <User className="w-5 h-5 flex-shrink-0" />
                      <span className="min-w-0">Main Profile</span>
                    </>
                  ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCardCollapsed(!isCardCollapsed)}
                className="text-white hover:bg-white/10 h-8 w-8 p-0 flex-shrink-0"
              >
                {isCardCollapsed ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          {!isCardCollapsed && (
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
                  {/* View Artwork Button */}
                  <Button
                    onClick={() => setShowArtworkModal(true)}
                    size="sm"
                    variant="secondary"
                    className="w-full bg-white/10 hover:bg-white/20 text-white border-white/20"
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    View Artwork
                  </Button>
                  
                  {selectedNFT.nftData?.description && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        Description:
                      </p>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {selectedNFT.nftData.description.length > 150 
                          ? `${selectedNFT.nftData.description.substring(0, 150)}...` 
                          : selectedNFT.nftData.description}
                      </p>
                    </div>
                  )}
                  
                  {selectedNFT.nftData?.contract && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Code className="w-3 h-3" />
                        Contract:
                      </p>
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
                        <ExternalLink className="w-3 h-3" />
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
                          {loadingMoreCollectors ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4 mr-2" />
                              Load More Collectors ({collectorFetchLimit})
                            </>
                          )}
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
                        {loadingCollectors ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading Collectors...
                          </>
                        ) : (
                          <>
                            <Users className="w-4 h-4 mr-2" />
                            Load Collectors
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* Expand from Contract Section */}
                <div className="pt-3 border-t border-white/20">
                  <p className="text-xs text-gray-400 mb-2">Expand from Contract:</p>
                  {expandedContracts.has(selectedNFT.nftData?.contract || '') ? (
                    <div className="space-y-2">
                      <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        Contract expanded
                      </Badge>
                      {contractNFTs.get(selectedNFT.nftData?.contract || '') && (
                        <p className="text-xs text-gray-400">
                          {contractNFTs.get(selectedNFT.nftData?.contract || '')?.length || 0} NFTs added from this contract
                        </p>
                      )}
                      {/* Load More from Contract Button */}
                      {contractPagination.get(selectedNFT.nftData?.contract || '')?.hasMore && (
                        <Button
                          onClick={() => loadContractNFTs(true)}
                          disabled={loadingContract}
                          size="sm"
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          {loadingContract ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4 mr-2" />
                              Load More from Contract ({contractExpandLimit})
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400">
                        Load more NFTs from the same collection
                      </p>
                      <Button
                        onClick={() => loadContractNFTs(false)}
                        disabled={loadingContract}
                        size="sm"
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        {loadingContract ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Package className="w-4 h-4 mr-2" />
                            Expand from Contract ({contractExpandLimit})
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* Collection Overview */}
                <div className="pt-3 border-t border-white/20">
                  <p className="text-xs text-gray-400 mb-2">Collection Overview:</p>
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1">
                    <Hash className="w-3 h-3" />
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
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors break-all inline-flex items-center gap-1"
                          >
                            <Globe className="w-3 h-3" />
                            {userProfile.website}
                          </a>
                        </div>
                      )}
                      
                      {userProfile.joined_date && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Joined:</p>
                          <p className="text-xs text-gray-300 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
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
                  
                  {/* Load Collection Button - only show for collector profiles that have no NFTs loaded yet */}
                  {showLoadButton && selectedProfile.id !== 0 && !Array.from(nftOwnership.values()).includes(selectedProfile.id) && (
                    <div className="pt-2">
                      <Button
                        onClick={loadCollection}
                        disabled={loadingNFTs}
                        variant="destructive"
                        size="sm"
                        className="w-full"
                      >
                        {loadingNFTs ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading NFTs...
                          </>
                        ) : (
                          <>
                            <Package className="w-4 h-4 mr-2" />
                            Load Collector&apos;s Collection
                          </>
                        )}
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
                        {loadingNFTs ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4 mr-2" />
                            Load More NFTs
                          </>
                        )}
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
          )}
        </Card>
      )}
    </div>
  );
}
