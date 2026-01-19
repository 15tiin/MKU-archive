import nominee from './nominee'
import archive from './archive'

export const schemaTypes = [
  nominee, 
  archive,
  {
    name: 'siteSettings',
    type: 'document',
    title: 'Site Settings',
    fields: [
      {
        name: 'heroVideo',
        type: 'file',
        title: 'Hero Background Video',
        options: {
          accept: 'video/*'
        }
      }
    ]
  }
]