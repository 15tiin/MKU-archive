export default {
  name: 'archive',
  title: 'Archive Flicks',
  type: 'document',
  fields: [
    {
      name: 'image',
      title: 'The Photo',
      type: 'image',
      options: { hotspot: true },
    },
    {
      name: 'caption',
      title: 'Caption',
      type: 'string',
    },
  ],
}