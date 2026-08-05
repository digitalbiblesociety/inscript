import { elem } from '../lib/helpers.esm.js';

class MorphologySelectorController {
  constructor(morphologies) {
    this.morphologies = morphologies;
    this.currentMorphology = morphologies.robinson;
    this.headerRow = elem('div', { className: 'morph-header-row', style: { display: 'contents' } },
      elem('div', { className: 'morph-th', style: { gridRow: '1' } }, 'Part of Speech'));
    this.mainRow = elem('div', { className: 'morph-main-row', style: { display: 'contents' } });
    const grid = elem('div', {
      className: 'morph-grid',
      style: { display: 'grid', gridAutoColumns: 'auto', gridTemplateRows: 'auto auto' }
    }, this.headerRow, this.mainRow);
    this.element = elem('div', { className: 'morph-selector' }, grid);
    this.partOfSpeechCell = elem('div', { className: 'morph-pos morph-td', style: { gridRow: '2' } });
    this.mainRow.appendChild(this.partOfSpeechCell);
    this.element.style.display = 'none';
    this.element.currentInput = null;
    this.element.updateMorphSelector = (value) => this.update(value);
    this.element.setMorphology = (value) => this.setMorphology(value);
    this.element.addEventListener('click', (event) => this.handleClick(event));
    document.body.appendChild(this.element);
    this.drawPartsOfSpeech();
  }

  clearDeclensions() {
    const firstHeader = this.headerRow.querySelector('.morph-th');
    [...firstHeader.parentElement.children]
      .filter((element) => element !== firstHeader)
      .forEach((element) => element.remove());
    const firstCell = this.mainRow.querySelector('.morph-td');
    [...firstCell.parentElement.children]
      .filter((element) => element !== firstCell)
      .forEach((element) => element.remove());
  }

  drawSelectedPartOfSpeech() {
    this.clearDeclensions();
    const selected = this.partOfSpeechCell.querySelector('.selected');
    if (!selected) return;
    const value = selected.getAttribute('data-value') ?? '';
    const partOfSpeech = this.currentMorphology.find((morph) => morph.letter === value);
    if (!partOfSpeech) return;
    for (const declension of partOfSpeech.declensions) this.drawDeclension(declension);
    const grid = this.element.querySelector('.morph-grid');
    this.element.style.height = `${grid.offsetHeight}px`;
  }

  drawDeclension(declension) {
    const header = elem('div', {
      className: 'morph-th',
      textContent: declension.declension,
      style: { gridRow: '1' }
    });
    const cell = elem('div', { className: 'morph-td', style: { gridRow: '2' } });
    for (const part of declension.parts) {
      cell.appendChild(elem('span', {
        textContent: part.type,
        dataset: { value: part.letter, ...(declension.breakBefore && { breakbefore: 'true' }) }
      }));
    }
    this.headerRow.appendChild(header);
    this.mainRow.appendChild(cell);
  }

  drawPartsOfSpeech() {
    this.partOfSpeechCell.innerHTML = '';
    for (const morph of this.currentMorphology) {
      this.partOfSpeechCell.appendChild(elem('span', { dataset: { value: morph.letter } }, morph.type));
    }
    this.drawSelectedPartOfSpeech();
  }

  setMorphology(value) {
    this.currentMorphology = this.morphologies[value] ?? this.morphologies.robinson;
    this.drawPartsOfSpeech();
  }

  selectOnly(span) {
    span.classList.add('selected');
    [...span.parentElement.children]
      .filter((element) => element !== span)
      .forEach((element) => element.classList.remove('selected'));
  }

  update(value) {
    if (value.length === 0) {
      this.element.querySelectorAll('span').forEach((span) => span.classList.remove('selected'));
      this.drawSelectedPartOfSpeech();
      return;
    }
    const partOfSpeech = this.partOfSpeechCell.querySelector(`span[data-value="${value[0]}"]`);
    if (!partOfSpeech) return;
    this.selectOnly(partOfSpeech);
    this.drawSelectedPartOfSpeech();
    if (value.length > 1) this.selectRemainder(value.substring(1).replace(/^-/, ''));
  }

  selectRemainder(remainder) {
    const cells = this.mainRow.querySelectorAll('.morph-td');
    for (let index = 0; index < remainder.length; index++) {
      cells[index + 1]?.querySelector(`span[data-value="${remainder[index]}"]`)?.classList.add('selected');
    }
  }

  handleClick(event) {
    const selected = event.target.closest('span');
    if (!selected) return;
    if (selected.classList.contains('selected')) selected.classList.remove('selected');
    else this.selectOnly(selected);
    if (selected.closest('.morph-td')?.classList.contains('morph-pos')) {
      this.drawSelectedPartOfSpeech();
    }
    const selector = this.buildSelector(selected.closest('.morph-main-row'));
    if (this.element.currentInput != null) this.element.currentInput.value = selector;
    this.element.dispatchEvent(new CustomEvent('update', { detail: selector }));
  }

  buildSelector(row) {
    const cells = [...row.querySelectorAll('.morph-td')];
    let lastSelected = -1;
    cells.forEach((cell, index) => {
      if (cell.querySelector('span.selected')) lastSelected = index;
    });
    return cells.map((cell, index) => this.selectorPart(cell, index <= lastSelected)).join('');
  }

  selectorPart(cell, fillGap) {
    const selected = cell.querySelector('span.selected');
    const includeBreak = cell.querySelector('span')?.getAttribute('data-breakbefore') === 'true';
    const prefix = includeBreak ? '-' : '';
    if (selected) return prefix + selected.getAttribute('data-value');
    return fillGap ? prefix + '?' : '';
  }
}

export const MorphologySelector = () => {
  const robinsonElements = {
    nounCase: {
      breakBefore: true,
      declension: 'Case',
      parts: [
        { letter: 'N', type: 'Nominative' },
        { letter: 'A', type: 'Accusative' },
        { letter: 'D', type: 'Dative' },
        { letter: 'G', type: 'Genitive' },
        { letter: 'V', type: 'Vocative' }
      ]
    },
    number: {
      declension: 'Number',
      parts: [
        { letter: 'P', type: 'Plural' },
        { letter: 'S', type: 'Singular' }
      ]
    },
    gender: {
      declension: 'Gender',
      parts: [
        { letter: 'F', type: 'Feminine' },
        { letter: 'M', type: 'Masculine' },
        { letter: 'N', type: 'Neuter' }
      ]
    },
    verbTense: {
      breakBefore: true,
      declension: 'Tense',
      parts: [
        { letter: 'A', type: 'Aorist' },
        { letter: 'F', type: 'Future' },
        { letter: 'I', type: 'Imperfect' },
        { letter: 'R', type: 'Perfect' },
        { letter: 'L', type: 'Pluperfect' },
        { letter: 'P', type: 'Present' }
      ]
    },
    verbVoice: {
      declension: 'Voice',
      parts: [
        { letter: 'A', type: 'Active' },
        { letter: 'M', type: 'Middle' },
        { letter: 'P', type: 'Passive' }
      ]
    },
    verbMood: {
      declension: 'Mood',
      parts: [
        { letter: 'I', type: 'Indicative' },
        { letter: 'S', type: 'Subjunctive' },
        { letter: 'O', type: 'Optative' },
        { letter: 'M', type: 'Imperative' },
        { letter: 'N', type: 'Infinitive' },
        { letter: 'P', type: 'Participle' }
      ]
    },
    person: {
      declension: 'Person',
      breakBefore: true,
      parts: [
        { letter: '1', type: '1st Person' },
        { letter: '2', type: '2nd Person' },
        { letter: '3', type: '3rd Person' }
      ]
    }
  };

  const morphhbElements = {
    nounTypes: {
      declension: 'Type',
      parts: [
        { letter: 'c', type: 'Common' },
        { letter: 'g', type: 'Gentilic' },
        { letter: 'p', type: 'Proper name' }
      ]
    },
    person: {
      declension: 'Person',
      breakBefore: true,
      parts: [
        { letter: '1', type: '1st Person' },
        { letter: '2', type: '2nd Person' },
        { letter: '3', type: '3rd Person' }
      ]
    },
    number: {
      declension: 'Number',
      parts: [
        { letter: 'p', type: 'Plural' },
        { letter: 's', type: 'Singular' },
        { letter: 'd', type: 'Dual' }
      ]
    },
    state: {
      declension: 'State',
      parts: [
        { letter: 'a', type: 'Absolute' },
        { letter: 'c', type: 'Construct' },
        { letter: 'd', type: 'Determined' }
      ]
    },
    nounGender: {
      declension: 'Gender',
      parts: [
        { letter: 'f', type: 'Feminine' },
        { letter: 'm', type: 'Masculine' },
        { letter: 'b', type: 'Both' }
      ]
    },
    verbGender: {
      declension: 'Gender',
      parts: [
        { letter: 'f', type: 'Feminine' },
        { letter: 'm', type: 'Masculine' },
        { letter: 'c', type: 'Common' }
      ]
    },
    verbStem: {
      declension: 'Stem',
      parts: [
        { letter: 'q', type: 'qal' },
        { letter: 'N', type: 'niphal' },
        { letter: 'p', type: 'piel' },
        { letter: 'P', type: 'pual' },
        { letter: 'h', type: 'hiphil' },
        { letter: 'H', type: 'hophal' },
        { letter: 't', type: 'hithpael' }
      ]
    },
    verbType: {
      declension: 'Type',
      parts: [
        { letter: 'p', type: 'perfect (qatal)' },
        { letter: 'q', type: 'sequential perfect (weqatal)' },
        { letter: 'i', type: 'imperfect (yiqtol)' },
        { letter: 'w', type: 'sequential imperfect (wayyiqtol)' },
        { letter: 'v', type: 'imperative' },
        { letter: 'r', type: 'participle active' },
        { letter: 's', type: 'participle passive' },
        { letter: 'a', type: 'infinitive absolute' },
        { letter: 'c', type: 'infinitive construct' }
      ]
    }
  };

  const morphologies = {
    robinson: [
      {
        letter: 'N',
        type: 'Noun',
        declensions: [robinsonElements.nounCase, robinsonElements.number, robinsonElements.gender]
      },
      {
        letter: 'V',
        type: 'Verb',
        declensions: [robinsonElements.verbTense, robinsonElements.verbVoice, robinsonElements.verbMood, robinsonElements.person, robinsonElements.number]
      }
    ],
    morphhb: [
      {
        letter: 'N',
        type: 'Noun',
        declensions: [morphhbElements.nounTypes, morphhbElements.nounGender, morphhbElements.number, morphhbElements.state]
      },
      {
        letter: 'V',
        type: 'Verb',
        declensions: [morphhbElements.verbStem, morphhbElements.verbType, morphhbElements.person, morphhbElements.number, morphhbElements.verbGender, morphhbElements.state]
      }
    ]
  };


  return new MorphologySelectorController(morphologies).element;
};

