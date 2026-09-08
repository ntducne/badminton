'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@heroui/react';
import { Copy, Check, QrCode } from 'lucide-react';
import { formatMoney } from '@/lib/calculations';

interface VietQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  payerName: string;
  amount: number;
  description: string;
}

export function VietQRModal({ isOpen, onClose, payerName, amount, description }: VietQRModalProps) {
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);

  const bankId = '970422'; // MBBank
  const accountNo = '0988888888';
  const accountName = 'NGUYEN DUC TUNG';

  const cleanDescription = description.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  const vietQrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(cleanDescription)}&accountName=${encodeURIComponent(accountName)}`;

  const copyToClipboard = (text: string, type: 'acc' | 'desc') => {
    navigator.clipboard.writeText(text);
    if (type === 'acc') {
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
    } else {
      setCopiedDesc(true);
      setTimeout(() => setCopiedDesc(false), 2000);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      placement="center"
      backdrop="blur"
      size="sm"
      classNames={{
        base: 'bg-white rounded-3xl border border-slate-200/80 shadow-2xl overflow-hidden',
        header: 'border-b border-slate-100 py-3.5 px-5',
        body: 'py-4 px-5',
        footer: 'border-t border-slate-100 py-3 px-5',
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                <QrCode size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Quét mã VietQR 1-chạm</h3>
                <p className="text-[11px] text-slate-400 font-normal">Tự động điền số tiền & nội dung</p>
              </div>
            </ModalHeader>

            <ModalBody className="gap-3">
              {/* Image Preview with motion */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-slate-50 p-2 rounded-2xl border border-slate-200/80 flex flex-col items-center shadow-inner"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={vietQrUrl}
                  alt="VietQR Napas 247"
                  className="w-full max-h-56 object-contain rounded-xl"
                />
              </motion.div>

              {/* Info Blocks */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
                  <div>
                    <span className="text-emerald-700 block text-[10px] font-semibold">Người thanh toán</span>
                    <span className="font-bold text-slate-800 text-sm">{payerName}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-700 block text-[10px] font-semibold">Số tiền cần chuyển</span>
                    <span className="font-extrabold text-emerald-700 text-base">{formatMoney(amount)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200/60">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block text-[10px]">Tài khoản MBBank</span>
                    <span className="font-mono font-bold text-slate-800 text-xs">
                      {accountNo} ({accountName})
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="flat"
                    color={copiedAcc ? 'success' : 'default'}
                    onPress={() => copyToClipboard(accountNo, 'acc')}
                    className="h-7 text-[11px] font-semibold rounded-lg"
                    startContent={copiedAcc ? <Check size={13} /> : <Copy size={13} />}
                  >
                    {copiedAcc ? 'Đã chép' : 'Chép STK'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200/60">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 block text-[10px]">Nội dung chuyển khoản</span>
                    <span className="font-medium text-slate-800 text-xs">{cleanDescription}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="flat"
                    color={copiedDesc ? 'success' : 'default'}
                    onPress={() => copyToClipboard(cleanDescription, 'desc')}
                    className="h-7 text-[11px] font-semibold rounded-lg"
                    startContent={copiedDesc ? <Check size={13} /> : <Copy size={13} />}
                  >
                    {copiedDesc ? 'Đã chép' : 'Chép'}
                  </Button>
                </div>
              </div>
            </ModalBody>

            <ModalFooter>
              <Button
                color="primary"
                variant="solid"
                onPress={onClose}
                className="w-full font-bold rounded-xl shadow-sm"
              >
                Đã hoàn tất
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
