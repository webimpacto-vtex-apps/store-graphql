import { UserInputError } from '@vtex/api'
import { concat, filter, groupBy, last, map, nth, path, prop, values } from 'ramda'

import { MasterData } from '../../clients/masterdata'
import { mapKeyValues } from '../../utils/object'
import { CatalogDataSource } from './../../dataSources/catalog'

import { acronymList, acronymListProduct, fields, fieldsListProduct, validateItems } from './util'

const getListItemsWithProductInfo = (items: any, catalog: CatalogDataSource) => Promise.all(
  map(async item => {
    const productsResponse = await catalog.productBySku([path(['skuId'], item) as string])
    const product = nth(0, productsResponse)
    return { ...item, product }
  }, items)
)

const getListItems = async (itemsId: any, catalog: CatalogDataSource, masterdata: MasterData) => {
  const items = itemsId ? await Promise.all(map((id: string) =>
    masterdata.getDocument(acronymListProduct, id, fieldsListProduct), itemsId)) : []
  return getListItemsWithProductInfo(items, catalog)
}

const addListItem = async (item: any, masterdata: MasterData) => {
  const { DocumentId } = await masterdata.createDocument(acronymListProduct, mapKeyValues({ ...item }) as any)
  return DocumentId
}

const addItems = async (items = [], masterdata: MasterData) => {
  validateItems(items, masterdata)
  const promises = map(async item => addListItem(item, masterdata), items)
  return Promise.all(promises)
}

const deleteItems = (items: any, masterdata: MasterData) => (
  items && Promise.all(items.map((item: any) => masterdata.deleteDocument(acronymListProduct, path(['id'], item) as string)))
)

const updateItems = async (items: any, dataSources: any) => {
  const { document } = dataSources
  const itemsWithoutDuplicated = map(item => last(item),
    values(groupBy(prop('skuId') as any, items)))
  const itemsToBeDeleted = filter(item => path<any>(['id'], item) && path(['quantity'], item) === 0, itemsWithoutDuplicated)
  const itemsToBeAdded = filter(item => !path(['id'], item), itemsWithoutDuplicated)
  const itemsToBeUpdated = filter(item => path<any>(['id'], item) && path<any>(['quantity'], item) > 0, itemsWithoutDuplicated)

  deleteItems(itemsToBeDeleted, document)

  const itemsIdAdded = await Promise.all(
    map(async item => await addListItem(item, document), itemsToBeAdded)
  )

  const itemsIdUpdated = map(
    item => {
      document.updateDocument(
        acronymListProduct,
        path(['id'], item),
        mapKeyValues(item))
      return path(['id'], item)
    },
    itemsToBeUpdated
  )

  return concat(itemsIdAdded, itemsIdUpdated)
}

export const queries = {
  list: async (_: any, { id }: any, { dataSources: { catalog }, clients: { masterdata } }: Context) => {
    const list = await masterdata.getDocument(acronymList, id, fields)
    const items = await getListItems(list.items, catalog, masterdata)
    return { id, ...list, items }
  },

  listsByOwner: async (_: any, { owner, page, pageSize }: any, context: Context) => {
    const { dataSources: { catalog }, clients: { masterdata } } = context
    const lists = await masterdata.searchDocuments(acronymList, fields, `owner=${owner}`, { page, pageSize })
    const listsWithProducts = map(async list => {
      const items = await getListItems(path(['items'], list), catalog, masterdata)
      return { ...list, items }
    }, lists)
    return Promise.all(listsWithProducts)
  }
}

export const mutation = {
  createList: async (_: any, { list, list: { items } }: any, context: Context) => {
    const { clients: { masterdata } } = context
    try {
      const itemsId = await addItems(items, masterdata)
      const { DocumentId } = await masterdata.createDocument(acronymList, mapKeyValues({ ...list, items: itemsId }) as any)
      return queries.list(_, { id: DocumentId }, context)
    } catch (error) {
      throw new UserInputError(`Cannot create list: ${error}`)
    }
  },

  deleteList: async (_: any, { id }: any, { clients: { masterdata } }: Context) => {
    const { items } = await masterdata.getDocument(acronymList, id, fields)
    await deleteItems(items, masterdata)
    return masterdata.deleteDocument(acronymList, id)
  },

  /**
   * Update the list informations and its items.
   * If the item given does not have the id, add it as a new item in the list
   * If the item given has got an id, but its quantity is 0, remove it from the list
   * Otherwise, update it.
   */
  updateList: async (_: any, { id, list, list: { items } }: any, context: Context) => {
    const { dataSources, clients: { masterdata } } = context
    try {
      const itemsUpdatedId = await updateItems(items, dataSources)
      await masterdata.updateDocument(acronymList, id, mapKeyValues({ ...list, items: itemsUpdatedId }) as any)
      return queries.list(_, { id }, context)
    } catch (error) {
      throw new UserInputError(`Cannot update the list: ${error}`)
    }
  },
}
