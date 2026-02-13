import { modelName as UserMN } from "@/models/_User";

export const relations: any = {
  user: `${UserMN};userId;_id`,
};
