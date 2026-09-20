import assert from 'node:assert/strict'
import test from 'node:test'
import { rankGoverningSections } from '../worker/index.js'

test('retrieval ranks matching headings above body-only mentions', () => {
  const sections = [
    { title: 'Meetings', sectionLabel: 'Section 2', body: 'Fences are mentioned here.' },
    { title: 'Fences', sectionLabel: 'Section 4', body: 'Approval is required.' },
    { title: 'Pool', sectionLabel: 'Section 5', body: 'Swimming hours.' },
  ]
  const ranked = rankGoverningSections('What do the documents say about fences?', sections)
  assert.deepEqual(ranked.map((section) => section.title), ['Fences', 'Meetings'])
})

test('retrieval does not return unrelated sections', () => {
  assert.deepEqual(rankGoverningSections('What about parking?', [
    { title: 'Fences', sectionLabel: 'Section 4', body: 'Approval is required.' },
  ]), [])
})
