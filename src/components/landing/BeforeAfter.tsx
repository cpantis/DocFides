'use client';

import { motion } from 'framer-motion';
import { FileWarning, FileCheck2, ArrowRight } from 'lucide-react';

export function BeforeAfter() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="font-heading text-3xl font-bold text-gray-900 sm:text-4xl">
            From chaos to clarity
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            Multiple source documents, one polished result
          </p>
        </motion.div>

        <div className="mt-16 flex flex-col items-center gap-8 lg:flex-row lg:gap-12">
          {/* Before */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex-1 rounded-2xl border border-red-200 bg-red-50/50 p-6"
          >
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-error">
              <FileWarning className="h-5 w-5" />
              Source Documents
            </div>
            <div className="space-y-3">
              {/* Simulated messy documents */}
              <div className="rounded-lg border border-red-100 bg-white p-4">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>CI_beneficiar.pdf</span>
                  <span className="rounded bg-warning/20 px-1.5 py-0.5 text-warning">scan</span>
                </div>
                <div className="mt-2 rotate-0.5 space-y-1.5 opacity-60">
                  <div className="h-2 w-3/4 rounded bg-gray-300" />
                  <div className="h-2 w-1/2 rounded bg-gray-300" />
                </div>
              </div>
              <div className="rounded-lg border border-red-100 bg-white p-4">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>Contract_furnizare.docx</span>
                </div>
                <div className="mt-2 space-y-1.5 opacity-60">
                  <div className="h-2 w-full rounded bg-gray-300" />
                  <div className="h-2 w-5/6 rounded bg-gray-300" />
                  <div className="h-2 w-2/3 rounded bg-gray-300" />
                </div>
              </div>
              <div className="rounded-lg border border-red-100 bg-white p-4">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>Deviz_estimativ.xlsx</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 opacity-60">
                  <div className="h-2 rounded bg-gray-300" />
                  <div className="h-2 rounded bg-gray-300" />
                  <div className="h-2 rounded bg-gray-300" />
                  <div className="h-2 rounded bg-gray-200" />
                  <div className="h-2 rounded bg-gray-200" />
                  <div className="h-2 rounded bg-gray-200" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Arrow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="flex-shrink-0 rotate-90 lg:rotate-0"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 shadow-lg shadow-primary-600/30">
              <ArrowRight className="h-5 w-5 text-white" />
            </div>
          </motion.div>

          {/* After */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex-1 rounded-2xl border border-green-200 bg-green-50/50 p-6"
          >
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-success">
              <FileCheck2 className="h-5 w-5" />
              Generated Document
            </div>
            <div className="rounded-lg border border-green-100 bg-white p-6">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <div className="h-2.5 w-2.5 rounded-full bg-success" />
                <div className="h-2 w-32 rounded bg-gray-200" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-2.5 w-full rounded bg-primary-100" />
                <div className="h-2.5 w-11/12 rounded bg-primary-100" />
                <div className="h-2.5 w-4/5 rounded bg-primary-100" />
              </div>
              <div className="mt-4 rounded border border-gray-100 p-3">
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="h-2 rounded bg-gray-300 font-semibold" />
                  <div className="h-2 rounded bg-gray-300" />
                  <div className="h-2 rounded bg-gray-300" />
                  <div className="h-2 rounded bg-primary-100" />
                  <div className="h-2 rounded bg-primary-100" />
                  <div className="h-2 rounded bg-primary-100" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-2.5 w-full rounded bg-primary-100" />
                <div className="h-2.5 w-3/4 rounded bg-primary-100" />
              </div>
              <div className="mt-4 flex justify-end">
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                  Score: 96/100
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
