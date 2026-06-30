const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 32;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1F\x7F]/;
const UNSAFE_SLUG_CHARACTER_PATTERN = /[^a-z0-9\s-]/g;
const WHITESPACE_PATTERN = /\s+/g;

const createTagValidationError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    return error;
};

const normalizeTagLabel = (value) => {
    if (typeof value !== 'string') {
        throw createTagValidationError('Tags must contain only strings.');
    }
    if (CONTROL_CHARACTER_PATTERN.test(value)) {
        throw createTagValidationError('Tags cannot contain control characters.');
    }

    const label = value
        .trim()
        .replace(/^#+/, '')
        .trim()
        .replace(WHITESPACE_PATTERN, ' ');

    if (label === '') {
        throw createTagValidationError('Tags cannot be empty.');
    }
    if (label.length > MAX_TAG_LENGTH) {
        throw createTagValidationError('Tag labels cannot exceed 32 characters.');
    }
    if (label.includes(',')) {
        throw createTagValidationError('Tags cannot contain commas.');
    }

    return label;
};

const tagToSlug = (label) => {
    const slug = normalizeTagLabel(label)
        .toLowerCase()
        .replace(UNSAFE_SLUG_CHARACTER_PATTERN, '')
        .trim()
        .replace(WHITESPACE_PATTERN, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (slug === '') {
        throw createTagValidationError('Tag slugs cannot be empty.');
    }

    return slug;
};

const parseTagsField = (value) => {
    if (value === undefined || value === null || value === '') {
        return [];
    }
    if (Array.isArray(value)) {
        throw createTagValidationError('Tags must be a JSON array string.');
    }
    if (typeof value !== 'string') {
        throw createTagValidationError('Tags must be a JSON array string.');
    }

    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch (error) {
        throw createTagValidationError('Tags must be valid JSON.');
    }

    if (!Array.isArray(parsed)) {
        throw createTagValidationError('Tags must be a JSON array.');
    }

    return parsed;
};

const normalizeTags = (value) => {
    const values = typeof value === 'string' || value === undefined || value === null
        ? parseTagsField(value)
        : value;

    if (!Array.isArray(values)) {
        throw createTagValidationError('Tags must be a JSON array.');
    }

    const tags = [];
    const tagSlugs = [];
    const seenLabels = new Set();

    for (const item of values) {
        const label = normalizeTagLabel(item);
        const dedupeKey = label.toLowerCase();

        if (seenLabels.has(dedupeKey)) {
            continue;
        }

        const slug = tagToSlug(label);
        seenLabels.add(dedupeKey);
        tags.push(label);
        tagSlugs.push(slug);

        if (tags.length > MAX_TAGS) {
            throw createTagValidationError('Tags cannot contain more than 10 items.');
        }
    }

    return { tags, tagSlugs };
};

module.exports = {
    MAX_TAGS,
    MAX_TAG_LENGTH,
    normalizeTagLabel,
    tagToSlug,
    parseTagsField,
    normalizeTags,
};
