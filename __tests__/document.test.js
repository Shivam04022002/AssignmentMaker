import {
  DEFAULT_TITLE,
  createDocument,
  hasDocumentChanges,
  normalizeDocument,
} from '../src/models/document';
import {
  LEGACY_STYLE_IDS,
  getHandwritingStyle,
  getHandwritingStyles,
  handwritingStyles,
} from '../src/data/handwritingStyles';
import { getPenColor } from '../src/data/pens';
import { getPageType } from '../src/data/paper';

describe('document creation', () => {
  it('creates a document with the Phase 1 defaults', () => {
    const doc = createDocument();
    expect(doc).toMatchObject({
      title: DEFAULT_TITLE,
      pageType: 'lined',
      pen: 'blue',
      handwritingStyle: 'reference_student',
      content: '',
    });
    expect(doc.id).toMatch(/^doc-/);
    expect(doc.createdAt).toBe(doc.updatedAt);
  });

  it('gives every document a unique id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createDocument().id));
    expect(ids.size).toBe(50);
  });

  it('keeps the options chosen on the New Document screen', () => {
    const doc = createDocument({
      pageType: 'blank',
      pen: 'black',
      handwritingStyle: 'cursive',
    });
    expect(doc.pageType).toBe('blank');
    expect(doc.pen).toBe('black');
    expect(doc.handwritingStyle).toBe('cursive');
  });
});

describe('page type', () => {
  it('accepts blank and lined', () => {
    expect(createDocument({ pageType: 'blank' }).pageType).toBe('blank');
    expect(createDocument({ pageType: 'lined' }).pageType).toBe('lined');
  });

  it('falls back to lined for unknown page types', () => {
    expect(createDocument({ pageType: 'graph' }).pageType).toBe('lined');
  });

  it('only lined paper is ruled', () => {
    expect(getPageType('lined').ruled).toBe(true);
    expect(getPageType('blank').ruled).toBe(false);
  });
});

describe('pen selection', () => {
  it('maps pens to the specified ink colours', () => {
    expect(getPenColor('blue')).toBe('#123A8C');
    expect(getPenColor('black')).toBe('#151515');
  });

  it('falls back to blue for unknown pens', () => {
    expect(createDocument({ pen: 'red' }).pen).toBe('blue');
    expect(getPenColor('red')).toBe('#123A8C');
  });
});

describe('handwriting selection', () => {
  it('provides the reference handwritings: Lang1 (default), Lang2 and Lang3', () => {
    expect(getHandwritingStyles().map(s => s.id)).toEqual([
      'reference_student',
      'reference_student_lang2',
      'reference_student_lang3',
    ]);
    expect(handwritingStyles.reference_student.name).toBe(
      'Reference Handwriting',
    );
    expect(handwritingStyles.reference_student.glyphs).toBe(true);
  });

  it('keeps old style ids as stored and draws them with the reference', () => {
    for (const id of LEGACY_STYLE_IDS) {
      expect(createDocument({ handwritingStyle: id }).handwritingStyle).toBe(
        id,
      );
      expect(getHandwritingStyle(id).id).toBe('reference_student');
    }
  });

  it('falls back to the reference for unknown ids', () => {
    expect(
      createDocument({ handwritingStyle: 'gothic' }).handwritingStyle,
    ).toBe('reference_student');
    expect(getHandwritingStyle('gothic').id).toBe('reference_student');
    expect(getHandwritingStyle(undefined).id).toBe('reference_student');
  });
});

describe('normalizeDocument', () => {
  it('repairs missing or invalid fields from storage', () => {
    const doc = normalizeDocument({ id: 'x', title: '   ', content: 42 });
    expect(doc.title).toBe(DEFAULT_TITLE);
    expect(doc.content).toBe('');
    expect(doc.id).toBe('x');
  });

  it('detects user-visible changes', () => {
    const doc = createDocument();
    expect(hasDocumentChanges(doc, { ...doc })).toBe(false);
    expect(hasDocumentChanges(doc, { ...doc, pen: 'black' })).toBe(true);
    expect(hasDocumentChanges(doc, { ...doc, content: 'x' })).toBe(true);
  });
});
