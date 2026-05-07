import { nanoid } from 'nanoid';

// Shared schema options used across all models so response shapes are identical
// to the previous lowdb implementation: documents expose `id` (nanoid string),
// `_id` and `__v` are hidden.
export function baseSchemaOptions(idLength = 8, extraTransform) {
  return {
    timestamps: true, // adds createdAt + updatedAt
    versionKey: false,
    toJSON: {
      virtuals: false,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        if (extraTransform) extraTransform(ret);
        return ret;
      }
    },
    toObject: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        if (extraTransform) extraTransform(ret);
        return ret;
      }
    }
  };
}

export const idField = (length = 8) => ({
  type: String,
  default: () => nanoid(length)
});

// Helpers for plain (lean) docs that bypass toJSON.
export const toApi = (doc) => {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(toApi);
  const { _id, __v, ...rest } = doc;
  return _id !== undefined ? { id: _id, ...rest } : rest;
};
