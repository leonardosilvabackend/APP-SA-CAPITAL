import type { IncomeConfiguration } from "./income-catalog";
export type Settings = IncomeConfiguration & {updatedAt:string;companyName:string;companyEmail:string|null;companyPhone:string|null;legalNotice:string;maxFileSizeMb:number;allowedFileTypes:string[]};
