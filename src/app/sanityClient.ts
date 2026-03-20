import { createClient } from 'next-sanity';
import imageUrlBuilder from '@sanity/image-url';

export const client = createClient({
  projectId: 'grcbjwuo', // Your official ID linked 🔗
  dataset: 'production',
  apiVersion: '2024-01-18',
  useCdn: true,
});

const builder = imageUrlBuilder(client);
export const urlFor = (source: any) => builder.image(source);