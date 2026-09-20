import assert from 'node:assert/strict'
import test from 'node:test'
import { governingAiAnswer, rankGoverningSections } from '../worker/index.js'

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

test('extracts the completion from the configured model response', () => {
  assert.equal(governingAiAnswer({ choices: [{ message: { content: '  Section 4 requires approval.  ' } }] }), 'Section 4 requires approval.')
  assert.equal(governingAiAnswer({ choices: [] }), '')
})
