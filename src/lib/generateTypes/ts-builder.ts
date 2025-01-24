import { Collection, Collections, Field } from "lib/types";

interface CollectionType {
  identifier: string;
  typeName: string;
  isSingleton: boolean;
  fields: FieldType[];
}

interface FieldType {
  identifier: string;
  type: string;
  isNullable: boolean;
  relation: "one" | "many" | "any" | "any_type" | null;
}

export class TypeBuilder {
  constructor(
    private collections: Collections,
    private useIntersectionTypes: boolean,
    private isSdk11: boolean,
  ) {}

  build() {
    const types: CollectionType[] = [];
    for (const collection of Object.values(this.collections)) {
      types.push(this.getCollectionType(collection));
    }
    return this.toTypeString(types);
  }

  private getCollectionType(collection: Collection): CollectionType {
    const fields: FieldType[] = [];

    for (const field of collection.fields) {
      if (!this.isFieldPresentational(field)) {
        fields.push({
          identifier: this.enquote(field.field),
          type: this.resolveFieldType(field),
          isNullable: field.schema?.is_nullable === true,
          relation: field.relation?.type ?? null,
        });
      }
    }

    return {
      identifier: collection.collection,
      typeName: this.pascalCase(collection.collection),
      isSingleton: collection.meta?.singleton === true,
      fields,
    };
  }

  private isFieldPresentational(field: Field): boolean {
    if (field.meta?.interface == null) return false;
    return (
      field.meta?.interface.startsWith("presentation-") ||
      field.meta?.interface.startsWith("group-")
    );
  }

  private toTypeString(collections: CollectionType[]) {
    let typeStr = "";

    for (const c of collections) {
      const fieldStr = (f: FieldType) =>
        `  ${f.identifier}: ${f.type}${f.isNullable ? " | null" : ""};`;

      typeStr +=
        `export interface ${c.typeName} {\n` +
        c.fields.map(fieldStr).join("\n") +
        "\n};\n\n";
    }

    const collStr = (c: CollectionType) =>
      `  ${c.identifier}: ${c.typeName}${c.isSingleton || this.isSdk11 ? "" : "[]"},`;

    typeStr +=
      "export interface CustomDirectusTypes {\n" +
      collections.map(collStr).join("\n") +
      "\n};\n";

    return typeStr;
  }

  private resolveFieldType(field: Field) {
    let type = "";

    // Type of the foreign table's primary key (in case relation isn't resolved)
    switch (field.relation?.type) {
      case "many": {
        const foreignPrimaryKeyField = this.collections[
          field.relation.collection
        ].fields.find((f) => f.schema?.is_primary_key)!;
        type = this.fieldType(foreignPrimaryKeyField) + "[]";
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
        type = this.fieldType(field);
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

    return type;
  }

  private fieldType(field: Field) {
    switch (field.type) {
      case "json":
      case "csv":
        return this.jsonType(field);
      case "geometry.Point":
        return '{ type: "Point", coordinates: [number, number] }';
      case "geometry.MultiPoint":
        return '{ type: "MultiPoint", coordinates: [number, number][] }';
      case "geometry.LineString":
        return '{ type: "LineString", coordinates: [number, number][] }';
      case "geometry.MultiLineString":
        return '{ type: "MultiLineString", coordinates: [number, number][][] }';
      case "geometry.Polygon":
        return '{ type: "Polygon", coordinates: [number, number][][] }';
      case "geometry.MultiPolygon":
        return '{ type: "MultiPolygon", coordinates: [number, number][][][] }';
      default: {
        switch (field.meta.interface) {
          case "select-dropdown":
          case "select-radio":
            return field.meta.options.allowOther
              ? this.primitiveType(field.type)
              : field.meta.options.choices
                  .map(({ value }) => `"${value}"`)
                  .join(" | ");
          default:
            return this.primitiveType(field.type);
        }
      }
    }
  }

  private primitiveType(type: string) {
    switch (type) {
      case "integer":
      case "bigInteger":
      case "float":
      case "decimal":
        return "number";
      case "boolean":
        return "boolean";
      case "json":
        return `"json"`;
      case "csv":
        return `"csv"`;
      case "datetime":
        return `"datetime"`;
      default:
        return "string";
    }
  }

  private jsonType(field: Field) {
    type Choice = { text: string; value: string };
    switch (field.meta.interface) {
      case "list":
        return `{${field.meta.options?.fields?.map((f) => `${this.enquote(f.name)}: ${this.fieldType(f)}`).join(", ")}}[]`;
      case "tags":
      case "select-multiple-dropdown":
      case "select-multiple-checkbox":
        return !field.meta.options?.allowOther
          ? `(${field.meta.options?.choices?.map((c: Choice) => `"${c.value}"`).join(" | ")})[]`
          : "string[]";
      case "select-multiple-checkbox-tree": {
        type NestedChoice = {
          text: string;
          value: string;
          children?: NestedChoice[];
        };
        const choiceValue = (choice: NestedChoice): string[] =>
          [choice.value].concat(choice.children?.flatMap(choiceValue) ?? []);
        return `(${field.meta.options?.choices
          ?.flatMap(choiceValue)
          .map((c: string) => `"${c}"`)
          .join(" | ")})[]`;
      }
      default:
        return `"json"`;
    }
  }

  private enquote(str: string) {
    const needsQuotes = /[^0-9A-Za-z_$]/;
    return needsQuotes.test(str) ? `"${str}"` : str;
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
