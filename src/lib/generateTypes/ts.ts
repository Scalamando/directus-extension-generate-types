import { Collections, Field } from "lib/types";
import { getCollections } from "../api";
import { TypeBuilder } from "./ts-builder";
import { Axios } from "axios";

export default async function generateTsTypes(
  api: Axios,
  useIntersectionTypes = false,
  sdk11 = true,
) {
  const collections = await getCollections(api);
	const typeBuilder = new TypeBuilder(collections, useIntersectionTypes, sdk11);
  return typeBuilder.build();
}

