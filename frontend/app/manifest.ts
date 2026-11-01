import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FlySwarm — MaleCNS v1.0 Connectome Solver',
    short_name: 'FlySwarm',
    description:
      'Ensemble Drosophila melanogaster whole-brain connectome simulation (166,700 neurons, 25.5M synapses) solving multi-modal CAPTCHAs in real time.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0C0E',
    theme_color: '#0B0C0E',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
