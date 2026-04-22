import React, { useEffect, useMemo, useState } from 'react';
import { programCatalog } from '../lib/emulator/program-catalog';

interface ProgramLibraryModalProps {
  favorites: string[];
  isOpen: boolean;
  onClose: () => void;
  onSelectProgram: (program: any) => void;
  onToggleFavorite: (programName: string) => void;
}

const categories = ['All', ...new Set(programCatalog.map((program) => program.category))];

export function ProgramLibraryModal({
  favorites,
  isOpen,
  onClose,
  onSelectProgram,
  onToggleFavorite,
}: ProgramLibraryModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedCategory('All');
      setShowFavoritesOnly(false);
    }
  }, [isOpen]);

  const filteredPrograms = useMemo(() => {
    let programs = programCatalog;

    if (showFavoritesOnly) {
      programs = programs.filter((program) => favorites.includes(program.name));
    }

    if (selectedCategory !== 'All') {
      programs = programs.filter((program) => program.category === selectedCategory);
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return programs;
    }

    return programs.filter((program) => {
      return (
        program.name.toLowerCase().includes(normalizedSearch) ||
        program.description.toLowerCase().includes(normalizedSearch) ||
        program.instructions.toLowerCase().includes(normalizedSearch) ||
        program.type.toLowerCase().includes(normalizedSearch) ||
        program.category.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [favorites, searchTerm, selectedCategory, showFavoritesOnly]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-emulator-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        data-emulator-modal="true"
        className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border-4 border-[#8b7355] bg-[#1b120d] text-[#f5e6d3] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-4 border-[#8b7355] px-6 py-4">
          <div>
            <h2 className="font-mono text-xl tracking-wide">PROGRAM LIBRARY</h2>
            <p className="mt-1 font-mono text-sm text-[#d4c5a9]">
              Showing {filteredPrograms.length} of {programCatalog.length} programs
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-[#8b7355] bg-[#2a1810] px-3 py-1 font-mono text-sm hover:bg-[#3a2820]"
          >
            CLOSE
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search programs by name, description, instructions, type, or category..."
            className="w-full border-2 border-[#8b7355] bg-black px-4 py-3 font-mono text-sm text-[var(--term-fg)] outline-none focus:border-[var(--term-fg)]"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowFavoritesOnly(false)}
              className={`border-2 px-3 py-2 font-mono text-sm ${
                !showFavoritesOnly ? 'border-[var(--term-fg)] bg-[var(--term-fg)] text-black' : 'border-[#8b7355] bg-[#2a1810]'
              }`}
            >
              All Programs
            </button>
            <button
              type="button"
              onClick={() => setShowFavoritesOnly(true)}
              className={`border-2 px-3 py-2 font-mono text-sm ${
                showFavoritesOnly ? 'border-[var(--term-fg)] bg-[var(--term-fg)] text-black' : 'border-[#8b7355] bg-[#2a1810]'
              }`}
            >
              Favorites Only
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`border px-3 py-1 font-mono text-xs ${
                  selectedCategory === category
                    ? 'border-[var(--term-fg)] bg-[var(--term-fg)] text-black'
                    : 'border-[#8b7355] bg-[#2a1810] text-[#f5e6d3]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto border-t-2 border-[#5a4530]">
          {filteredPrograms.length === 0 ? (
            <div className="px-6 py-10 text-center font-mono text-sm text-[#d4c5a9]">
              No programs match your current filters.
            </div>
          ) : (
            filteredPrograms.map((program) => {
              const isFavorite = favorites.includes(program.name);

              return (
                <div
                  key={program.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectProgram(program)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectProgram(program);
                    }
                  }}
                  className="flex w-full cursor-pointer flex-col gap-2 border-b border-[#5a4530] px-6 py-4 text-left hover:bg-[#241812]"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(program.name);
                      }}
                      className="mt-0.5 font-mono text-xl leading-none"
                      aria-label={isFavorite ? `Remove ${program.name} from favorites` : `Add ${program.name} to favorites`}
                    >
                      {isFavorite ? '★' : '☆'}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
                        <span className="border border-[#8b7355] bg-black px-2 py-0.5 text-xs uppercase tracking-wide">
                          {program.type}
                        </span>
                        <span className="border border-[#8b7355] bg-[#2a1810] px-2 py-0.5 text-xs uppercase tracking-wide">
                          {program.category}
                        </span>
                        <span className="text-base text-[#f5e6d3]">{program.name}</span>
                      </div>
                      <p className="mt-2 font-mono text-sm text-[#d4c5a9]">{program.description}</p>
                      <div
                        className="mt-2 font-mono text-xs leading-5 text-[#f5e6d3] opacity-90"
                        dangerouslySetInnerHTML={{ __html: program.instructions }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
