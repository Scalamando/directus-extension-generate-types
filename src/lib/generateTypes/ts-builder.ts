import { Collection, Collections, Field } from "lib/types";

export class TypeBuilder {
  constructor(
    private collections: Collections,
    private useIntersectionTypes: boolean,
    private sdk11: boolean,
  ) {}

  build() {
    let ret = "";
    const types: string[] = [];

    for (const collection of Object.values(this.collections)) {
      const collectionName = collection.collection;
      const typeName = this.pascalCase(collectionName);
      const isSingleton = collection.meta?.singleton === true;

      types.push(
        this.sdk11
          ? `${collectionName}: ${typeName}${isSingleton ? "" : "[]"}`
          : `${collectionName}: ${typeName}`,
      );

      ret += this.collectionType(typeName, collection);
    }

    ret +=
      "export type CustomDirectusTypes = {\n" +
      types.map((x) => `  ${x};`).join("\n") +
      "\n};\n";

    return ret;
  }

  private collectionType(name: string, collection: Collection) {
    const types: string[] = [];

    for (const field of collection.fields) {
      if (this.isFieldPresentational(field)) continue;

      const identifier = field.field.includes("-")
        ? `"${field.field}"`
        : field.field;
      types.push(
        `${identifier}${field.schema?.is_nullable ? "?" : ""}: ${this.fieldType(field)};`,
      );
    }

    return (
      `export type ${name} = {\n` +
      types.map((x) => `  ${x};`).join("\n") +
      "};\n\n"
    );
  }

  private fieldType(field: Field) {
    let type = "";

    // Type of ID Field (in case relation isn't resolved via 'fields' query)
    switch (field.relation?.type) {
      case "many": {
        const relationIdField = this.collections[
          field.relation.collection
        ].fields.find((f) => f.field === "id")!;
        type = this.primitiveType(relationIdField) + "[]";
        break;
      }
      case "any": {
        // Many to any foreign keys are always strings
        type = "string";
        break;
      }
      case "any_type": {
        type += field.relation.collections
          .map((collection) => `"${this.pascalCase(collection)}"`)
          .join(" | ");
        break;
      }
      default: {
        type = this.primitiveType(field);
      }
    }

    // Type of related collection(s)
    if (field.relation && field.relation.type !== "any_type") {
      type += this.useIntersectionTypes ? " & " : " | ";

      if (field.relation.type === "any") {
        // m2a collections have multiple related types
        type += field.relation.collections.map(this.pascalCase).join(" | ");
      } else {
        type += field.relation.collection
          ? this.pascalCase(field.relation.collection)
          : "any";
        if (field.relation.type === "many") type += "[]";
      }
    }

    if (field.schema?.is_nullable) {
      if (field.relation && this.useIntersectionTypes) {
        type = `(${type}) | null`;
      } else {
        type += ` | null`;
      }
    }

    return type;
  }

  private isFieldPresentational(field: Field): boolean {
    if (field.meta?.interface == null) return false;
    return (
      field.meta?.interface.startsWith("presentation-") ||
      field.meta?.interface.startsWith("group-")
    );
  }

  private primitiveType(field: Field) {
    if (["integer", "bigInteger", "float", "decimal"].includes(field.type))
      return "number";
    else if (["boolean"].includes(field.type)) return "boolean";
    else if (["json", "csv"].includes(field.type)) return "unknown";
    else return "string";
  }

  private pascalCase(str: string) {
    return str
      .split(" ")
      .flatMap((x) => x.split("_"))
      .flatMap((y) => y.split("-"))
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join("");
  }
}
