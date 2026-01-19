export default {
  name: 'nominee',
  title: 'Nominee',
  type: 'document',
  fields: [
    {
      name: 'handle',
      title: 'IG Handle',
      type: 'string',
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: 'photos',
      title: 'Drip Photos',
      type: 'array',
      of: [{ type: 'image' }],
      options: { layout: 'grid' },
    },
    {
      name: 'votes',
      title: 'Vote Count (Manual for now)',
      type: 'number',
      initialValue: 0,
    },
  ],
}