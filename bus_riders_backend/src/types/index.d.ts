import { Schema, Types } from 'mongoose'

export type ObjectIdType = string | Schema.Types.ObjectId | Types.ObjectId | ObjectId
export type ObjectIdExtendType = { _id?: ObjectIdType }
