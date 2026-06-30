const test = require('node:test');
const assert = require('node:assert/strict');

const {
    MAX_TAGS,
    MAX_TAG_LENGTH,
    normalizeTagLabel,
    tagToSlug,
    parseTagsField,
    normalizeTags,
} = require('../utils/tags');

const assertTagError = (callback, messagePart) => {
    assert.throws(
        callback,
        (error) => error instanceof Error
            && error.statusCode === 400
            && error.message.includes(messagePart),
    );
};

test('missing tags normalizes to empty arrays', () => {
    assert.deepEqual(normalizeTags(undefined), { tags: [], tagSlugs: [] });
    assert.deepEqual(normalizeTags(null), { tags: [], tagSlugs: [] });
});

test('empty string tags field normalizes to empty arrays', () => {
    assert.deepEqual(normalizeTags(''), { tags: [], tagSlugs: [] });
});

test('valid JSON array normalizes correctly', () => {
    assert.deepEqual(normalizeTags('["dog","golden retriever","New York"]'), {
        tags: ['dog', 'golden retriever', 'New York'],
        tagSlugs: ['dog', 'golden-retriever', 'new-york'],
    });
});

test('leading # is stripped', () => {
    assert.equal(normalizeTagLabel('#Dog'), 'Dog');
    assert.deepEqual(normalizeTags(['##Dog']), {
        tags: ['Dog'],
        tagSlugs: ['dog'],
    });
});

test('repeated spaces collapse', () => {
    assert.equal(normalizeTagLabel('golden   retriever'), 'golden retriever');
});

test('spaces inside tags are preserved', () => {
    assert.deepEqual(normalizeTags(['New York']), {
        tags: ['New York'],
        tagSlugs: ['new-york'],
    });
});

test('case-insensitive duplicates are removed', () => {
    assert.deepEqual(normalizeTags(['Dog', 'dog', '#DOG']), {
        tags: ['Dog'],
        tagSlugs: ['dog'],
    });
});

test('display casing from first accepted label is preserved', () => {
    assert.deepEqual(normalizeTags(['New York', 'new york']), {
        tags: ['New York'],
        tagSlugs: ['new-york'],
    });
});

test('slugs are generated correctly', () => {
    assert.equal(tagToSlug('Dog'), 'dog');
    assert.equal(tagToSlug('golden retriever'), 'golden-retriever');
    assert.equal(tagToSlug('New York'), 'new-york');
    assert.equal(tagToSlug('Dogs & Cats!'), 'dogs-cats');
});

test('malformed JSON is rejected', () => {
    assertTagError(() => parseTagsField('dog,golden retriever'), 'valid JSON');
});

test('non-array JSON is rejected', () => {
    assertTagError(() => parseTagsField('{"tag":"dog"}'), 'JSON array');
});

test('non-string entries are rejected', () => {
    assertTagError(() => normalizeTags(['dog', 123]), 'strings');
});

test('more than 10 tags is rejected', () => {
    const tags = Array.from({ length: MAX_TAGS + 1 }, (_, index) => `tag-${index}`);

    assertTagError(() => normalizeTags(tags), 'more than 10');
});

test('tag longer than 32 characters is rejected', () => {
    assert.equal(MAX_TAG_LENGTH, 32);
    assertTagError(() => normalizeTags(['a'.repeat(MAX_TAG_LENGTH + 1)]), '32 characters');
});

test('comma inside a final tag is rejected', () => {
    assertTagError(() => normalizeTags(['dog,cat']), 'commas');
});

test('control characters are rejected', () => {
    assertTagError(() => normalizeTags(['dog\ncat']), 'control characters');
});
