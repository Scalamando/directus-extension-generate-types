import type {
  Collection as DirectusCollection,
  Field as DirectusField,
} from "@directus/shared/types";

export type Field = PlainField | M2OField | M2MField | M2AField | M2ATypeField;
export type PlainField = DirectusField & {
  relation?: undefined;
};
export type M2OField = DirectusField & {
  relation: {
    type: "one";
    collection: string;
  };
};
export type M2MField = DirectusField & {
  relation: {
    type: "many";
    collection: string;
  };
};
export type M2AField = DirectusField & {
  relation: {
    type: "any";
    collections: string[];
  };
};
export type M2ATypeField = DirectusField & {
  relation: {
    type: "any_type";
    collections: string[];
  };
};
export type Collection = DirectusCollection & { fields: Field[] };
export type Collections = { [collection: string]: Collection };
