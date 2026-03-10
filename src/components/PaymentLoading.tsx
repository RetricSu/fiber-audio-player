'use client';

import { motion, AnimatePresence } from 'motion/react';

interface PaymentLoadingProps {
  isVisible: boolean;
  currentStep: 1 | 2 | 3;
  onCancel?: () => void;
}

interface StepConfig {
  id: number;
  label: string;
  description: string;
}

const steps: StepConfig[] = [
  { id: 1, label: '创建会话...', description: '正在初始化播放会话' },
  { id: 2, label: '生成发票...', description: '正在生成支付发票' },
  { id: 3, label: '等待支付确认...', description: '区块链网络确认中' },
];

export function PaymentLoading({ isVisible, currentStep, onCancel }: PaymentLoadingProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-fiber-dark/80 backdrop-blur-sm"
            onClick={onCancel}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md bg-fiber-surface border border-fiber-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
          >
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-fiber-accent/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-fiber-flow/10 rounded-full blur-3xl" />

            <div className="relative z-10 p-6 sm:p-8">
              <div className="mb-8">
                <motion.h3
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-lg font-display font-light text-white mb-2"
                >
                  支付处理中
                </motion.h3>
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-sm text-fiber-muted"
                >
                  正在建立支付通道，请稍候...
                </motion.p>
              </div>

              <div className="space-y-4 mb-8">
                {steps.map((step, index) => {
                  const isCompleted = step.id < currentStep;
                  const isCurrent = step.id === currentStep;
                  const isPending = step.id > currentStep;

                  const containerClass = isCurrent
                    ? 'flex items-center gap-4 p-3 rounded-xl transition-all duration-300 bg-fiber-accent/10 border border-fiber-accent/30'
                    : isCompleted
                    ? 'flex items-center gap-4 p-3 rounded-xl transition-all duration-300 bg-fiber-surface/50'
                    : 'flex items-center gap-4 p-3 rounded-xl transition-all duration-300 bg-transparent';

                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + index * 0.1 }}
                      className={containerClass}
                    >
                      <div className="relative flex-shrink-0">
                        {isCompleted ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center"
                          >
                            <svg
                              className="w-4 h-4 text-green-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </motion.div>
                        ) : isCurrent ? (
                          <div className="relative">
                            <motion.div
                              className="w-8 h-8 rounded-full border-2 border-fiber-accent/30 border-t-fiber-accent"
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: 'linear',
                              }}
                            />
                            <motion.div
                              className="absolute inset-0 rounded-full bg-fiber-accent"
                              animate={{
                                scale: [1, 1.4],
                                opacity: [0.3, 0],
                              }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-fiber-border flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-fiber-muted" />
                          </div>
                        )}

                        {index < steps.length - 1 && (
                          <div
                            className={
                              isCompleted
                                ? 'absolute left-1/2 top-8 w-px h-6 -translate-x-1/2 bg-green-500/50'
                                : 'absolute left-1/2 top-8 w-px h-6 -translate-x-1/2 bg-fiber-border'
                            }
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div
                          className={
                            isCurrent
                              ? 'text-sm font-medium transition-colors text-fiber-accent'
                              : isCompleted
                              ? 'text-sm font-medium transition-colors text-green-400'
                              : 'text-sm font-medium transition-colors text-fiber-muted'
                          }
                        >
                          {step.label}
                        </div>
                        <div
                          className={
                            isCurrent
                              ? 'text-xs transition-colors mt-0.5 text-fiber-muted/80'
                              : isCompleted
                              ? 'text-xs transition-colors mt-0.5 text-green-400/60'
                              : 'text-xs transition-colors mt-0.5 text-fiber-muted/50'
                          }
                        >
                          {step.description}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center gap-2 text-xs text-fiber-muted/80 mb-6"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>预计需要 10-60 秒</span>
              </motion.div>

              {onCancel && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="flex justify-center"
                >
                  <button
                    onClick={onCancel}
                    className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-fiber-muted hover:text-white transition-colors border border-fiber-border hover:border-fiber-muted rounded-lg"
                  >
                    取消
                  </button>
                </motion.div>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-1 bg-fiber-border overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-fiber-accent via-fiber-flow to-fiber-accent"
                initial={{ width: '0%' }}
                animate={{
                  width: currentStep === 1 ? '33%' : currentStep === 2 ? '66%' : '100%',
                }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
