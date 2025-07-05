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
      }))
    ],
    links: [
      // Connect all NFT nodes to the profile node (ID 0)
      ...nfts.map((_, index) => ({
        source: 0, // Profile node
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
      })()
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
      
      // Add blue glow effect for profile nodes
      const glowGeometry = new THREE.SphereGeometry(15, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
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
      setShowLoadButton(true);
    } else {
      setShowLoadButton(false);
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
    if (!userProfile?.address) return;

    setLoadingNFTs(true);
    try {
      const response = await fetch(`/api/opensea/nfts?address=${encodeURIComponent(userProfile.address)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch NFTs');
      }

      const data: NFTResponse = await response.json();
      setNfts(data.nfts);
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
    if (!userProfile?.address || !nextToken) return;

    setLoadingNFTs(true);
    try {
      const response = await fetch(`/api/opensea/nfts?address=${encodeURIComponent(userProfile.address)}&next=${encodeURIComponent(nextToken)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch more NFTs');
      }

      const data: NFTResponse = await response.json();
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

  useEffect(() => {
    // Optional: Add some initial camera positioning or other setup
    if (fgRef.current && userProfile) {
      // Access the ForceGraph3D component methods
      const graph = fgRef.current;
      if (graph && typeof graph === 'object' && 'cameraPosition' in graph) {
        graph.cameraPosition({ z: 120 }); // Further back for multiple nodes
      }
    }
  }, [userProfile]);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      margin: 0, 
      padding: 0,
      background: 'linear-gradient(to bottom, #0f0f23, #1a1a3e)',
      overflow: 'hidden'
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
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            width: '90%',
            maxWidth: '500px',
            textAlign: 'center'
          }}>
            <h2 style={{ 
              margin: '0 0 1rem 0', 
              color: '#333',
              fontSize: '1.5rem',
              fontWeight: 'bold'
            }}>
              NFT Profile Explorer
            </h2>
            <p style={{ 
              margin: '0 0 1.5rem 0', 
              color: '#666',
              fontSize: '1rem'
            }}>
              Enter an Ethereum address to view their NFT profile
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x... or username"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '2px solid #e1e5e9',
                  fontSize: '1rem',
                  marginBottom: '1rem',
                  boxSizing: 'border-box'
                }}
                disabled={loading}
              />
              {error && (
                <p style={{ 
                  color: '#e74c3c', 
                  margin: '0 0 1rem 0',
                  fontSize: '0.9rem'
                }}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: loading ? '#bdc3c7' : '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
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
          linkWidth={2}
          nodeRelSize={6}
          enableNodeDrag={true}
          enableNavigationControls={true}
          showNavInfo={true}
          nodeLabel={(node: any) => {
            const nodeData = node as NodeData;
            if (nodeData.nodeType === 'profile') {
              return `${nodeData.username || 'Profile'} - Click to load collection`;
            } else {
              return `${nodeData.username || 'NFT'}\n${nodeData.nftData?.description?.substring(0, 100) || ''}...\nContract: ${nodeData.contract || 'Unknown'}`;
            }
          }}
        />
      )}

      {/* Load Collection Button */}
      {showLoadButton && userProfile && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 500
        }}>
          <button
            onClick={loadCollection}
            disabled={loadingNFTs}
            style={{
              padding: '1rem 2rem',
              backgroundColor: loadingNFTs ? '#bdc3c7' : '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: loadingNFTs ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s'
            }}
          >
            {loadingNFTs ? 'Loading NFTs...' : 'Load Collection'}
          </button>
        </div>
      )}

      {/* User Info Overlay */}
      {userProfile && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '1rem',
          borderRadius: '8px',
          maxWidth: '300px',
          zIndex: 100
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>
            {userProfile.username || 'Unknown User'}
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', opacity: 0.8 }}>
            {userProfile.address || 'No address'}
          </p>
          {userProfile.bio && (
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>
              {userProfile.bio}
            </p>
          )}
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', opacity: 0.7 }}>
            Joined: {userProfile.joined_date ? new Date(userProfile.joined_date).toLocaleDateString() : 'Unknown'}
          </p>
          {nfts.length > 0 && (
            <p style={{ margin: '0', fontSize: '0.8rem', color: '#4CAF50' }}>
              {nfts.length} NFTs loaded
            </p>
          )}
        </div>
      )}

      {/* NFT Details Overlay */}
      {gData.nodes.find(node => node.nodeType === 'nft') && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '1rem',
          borderRadius: '8px',
          maxWidth: '350px',
          zIndex: 100
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
            NFT Collection Loaded
          </h4>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', opacity: 0.8 }}>
            Click on any NFT node to see details. Each NFT is connected to the profile.
          </p>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#4CAF50' }}>
            Total: {nfts.length} NFTs
          </p>
          {hasMoreNFTs && (
            <button
              onClick={loadMoreNFTs}
              disabled={loadingNFTs}
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: loadingNFTs ? '#bdc3c7' : '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                cursor: loadingNFTs ? 'not-allowed' : 'pointer',
                width: '100%',
                transition: 'background-color 0.2s'
              }}
            >
              {loadingNFTs ? 'Loading...' : 'Load More (5)'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
