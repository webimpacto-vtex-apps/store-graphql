import { IOClients } from '@vtex/api'

import { MasterData } from './masterdata'
import { CallCenterOperator } from './callCenterOperator'

export class Clients extends IOClients {
  public get masterdata() {
    return this.getOrSet('masterdata', MasterData)
  }

  public get callCenterOperator() {
    return this.getOrSet('callCenterOperator', CallCenterOperator)
  }
}
