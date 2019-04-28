import { compose, find, last, path, prop, split } from 'ramda'
import { toIOMessage } from '../../utils/ioMessage'

const lastSegment = compose<string, string[], string>(last, split('/'))

interface Category {
  id: string,
  url: string,
  department: boolean,
  children: Category[],
}

const getCategoryInfo = async (catalog: any, id: string) => {
  const categories = await catalog.categories(3) as Category[]

  const departments = categories.map(category => ({ ...category, department: true }))

  const flattenCategories = departments.reduce((acc: Category[], department) => {
    const childCategories = department.children.reduce(concatChildren, [])
    return acc.concat(department, department.children, childCategories)
  }, [])

  const category = find(
    (c : Category) => c.id === id,
    flattenCategories
  ) || { url: '', department: false }

  return category
}

const concatChildren = (acc: Category[], category: Category) => acc.concat(category.children)

export const resolvers = {
  Category: {
    cacheId: prop('id'),

    href: async ({ id }: any, _: any, { dataSources: { catalog } }: any) => {
      const category = await getCategoryInfo(catalog, id)

      const href = category.url.replace(
        /https:\/\/[A-z0-9]+\.vtexcommercestable\.com\.br/,
        ''
      )

      return href
    },

    metaTagDescription: prop('MetaTagDescription'),

    name: ({name}: any, _: any, ctx: Context) => toIOMessage(ctx, name, `category-${name}`),

    slug: async ({ id }: any, _: any, { dataSources: { catalog } }: any) => {
      const category = await getCategoryInfo(catalog, id)

      return category.url ? lastSegment(category.url) : null
    },

    titleTag: prop('Title'),

    children: async ({ id }: any, _: any, { dataSources: { catalog } }: any) => {
      const category = await getCategoryInfo(catalog, id)

      return path(['children'], category)
    },
  },
}
