import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  DollarSign,
  TrendingUp,
  Users,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Copy,
  CheckCircle,
  CreditCard,
  Smartphone
} from 'lucide-react';
import axios from 'axios';

interface DashboardStats {
  totalBalance: number;
  totalDeposits: number;
  totalCommissions: number;
  pendingUplineCredit?: number;
  creditBlocked?: boolean;
  monthlyEarnings: number;
  directReferrals: number;
  totalTeamSize: number;
  recentTransactions: Transaction[];
}

interface Transaction {
  id: string;
  type: 'deposit' | 'commission';
  amount: number;
  status: 'pending' | 'completed' | 'rejected';
  createdAt: string;
  description?: string;
}

interface CreditTransfer {
  _id: string;
  amount: number;
  fromUser: {
    _id: string;
    fullName: string;
    username?: string;
  };
  toUser: {
    _id: string;
    fullName: string;
    username?: string;
  };
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'paid';
  createdAt: string;
  paidAt?: string;
}

interface MerchantAccount {
  _id: string;
  name: string;
  type: 'bank' | 'mobile_money';
  accountNumber: string;
  accountName: string;
  bankName?: string;
  phoneNumber?: string;
  instructions: string;
}

export default function Dashboard() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [merchantAccounts, setMerchantAccounts] = useState<MerchantAccount[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<CreditTransfer[]>([]);
  const [approvalProcessing, setApprovalProcessing] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<{ [key: string]: string }>({});
  const [showRejectForm, setShowRejectForm] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [showReferralCode, setShowReferralCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUplinePaymentModal, setShowUplinePaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    reference: ''
  });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [selectedMerchantAccountId, setSelectedMerchantAccountId] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  useEffect(() => {
    if (merchantAccounts.length && !selectedMerchantAccountId) {
      setSelectedMerchantAccountId(merchantAccounts[0]._id);
      setPaymentMethod(merchantAccounts[0].type);
    }
  }, [merchantAccounts, selectedMerchantAccountId]);

  // useEffect(() => {
  //   fetchDashboardData();
  // }, []);

  const fetchPendingTransfers = async () => {
    try {
      const response = await axios.get('/admin/credit-transfers/pending');
      setPendingTransfers(response.data.transfers || []);
    } catch (error) {
      console.error('Failed to fetch pending credit transfers:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, merchantResponse] = await Promise.all([
        axios.get('/dashboard/stats'),
        axios.get('/deposits/merchant-accounts')
      ]);

      setStats(statsResponse.data);
      setMerchantAccounts(merchantResponse.data.merchantAccounts);
      await fetchPendingTransfers();

      if (updateUser) {
        updateUser({
          pendingUplineCredit: statsResponse.data.pendingUplineCredit,
          creditBlocked: statsResponse.data.creditBlocked,
        });
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = async () => {
    if (user?.referralCode) {
      try {
        await navigator.clipboard?.writeText(user.referralCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Silent fail if clipboard not available
      }
    }
  };

  const handleApproveCredit = async (transferId: string) => {
    setApprovalProcessing(transferId);
    try {
      await axios.post(`/admin/credit-transfers/${transferId}/approve`);
      await fetchPendingTransfers();
      await fetchDashboardData();
      alert('Credit transfer approved successfully');
    } catch (error) {
      const apiError = error as any;
      console.error('Error approving credit transfer:', apiError);
      alert(
        apiError?.response?.data?.message || 'Failed to approve credit transfer',
      );
    } finally {
      setApprovalProcessing(null);
    }
  };

  const handleRejectCredit = async (transferId: string) => {
    const reason = rejectionReason[transferId]?.trim();
    if (!reason) {
      alert('Please provide a rejection reason.');
      return;
    }

    setApprovalProcessing(transferId);
    try {
      await axios.post(`/admin/credit-transfers/${transferId}/reject`, {
        reason,
      });
      setRejectionReason((prev) => ({ ...prev, [transferId]: '' }));
      setShowRejectForm((prev) => ({ ...prev, [transferId]: false }));
      await fetchPendingTransfers();
      await fetchDashboardData();
      alert('Credit transfer rejected successfully');
    } catch (error) {
      const apiError = error as any;
      console.error('Error rejecting credit transfer:', apiError);
      alert(
        apiError?.response?.data?.message || 'Failed to reject credit transfer',
      );
    } finally {
      setApprovalProcessing(null);
    }
  };

  const handleSubmitUplinePayment = async () => {
    if (!paymentAmount.trim() || Number(paymentAmount) <= 0) {
      alert('Credit amount is required.');
      return;
    }

    if (!selectedMerchantAccountId) {
      alert('Please select a merchant account.');
      return;
    }

    if (!paymentForm.reference.trim()) {
      alert('Please provide a transaction reference.');
      return;
    }

    if (!receiptFile) {
      alert('Please upload your payment receipt.');
      return;
    }

    setSubmittingPayment(true);
    try {
      const formData = new FormData();
      formData.append('package', 'Credit Payment');
      formData.append('amount', paymentAmount);
      formData.append('paymentMethod', paymentMethod);
      formData.append('merchantAccountId', selectedMerchantAccountId);
      formData.append('transactionReference', paymentForm.reference.trim());
      formData.append('receipt', receiptFile);

      await axios.post('/deposits', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setShowUplinePaymentModal(false);
      setPaymentForm({ reference: '' });
      setReceiptFile(null);
      setPaymentAmount('');
      await fetchDashboardData();
      alert('Credit payment submitted successfully! Awaiting approval like a normal deposit.');
    } catch (error: any) {
      console.error('Error submitting upline payment:', error);
      alert(error?.response?.data?.message || 'Failed to submit payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  function copyTextFallback(text: string) {
    let textarea: HTMLTextAreaElement | null = null;
    try {
      textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '1px';
      textarea.style.height = '1px';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      const successful = document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      return successful;
    } catch (err) {
      console.error('Error in copyTextFallback:', err);
      return false;
    } finally {
      if (textarea && textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
    }
  }

  function copyText(text: string) {
    let textarea: HTMLTextAreaElement | null = null;
    try {
      textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '1px';
      textarea.style.height = '1px';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      const successful = document.execCommand('copy');
      return successful;
    } catch (err) {
      console.error('Error in copying:', err);
      return false;
    } finally {
      if (textarea && textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
    }
  }

  const referralLink = `http://localhost:3000/register?ref=${user?.referralCode}`;

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-12 h-12 border-b-2 rounded-full animate-spin border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 bg-gray-50">
      <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.fullName}!
          </h1>
          <p className="mt-1 text-gray-600">
            Here's an overview of your investment portfolio and earnings
          </p>
        </div>


        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Balance</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(stats?.totalBalance || user?.balance || 0).toLocaleString()} ETB
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              <ArrowUpRight className="w-4 h-4 mr-1 text-green-500" />
              <span className="text-green-600">Available balance</span>
            </div>
          </div>

          <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Deposits</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(stats?.totalDeposits || user?.totalDeposits || 0).toLocaleString()} ETB
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              <span className="text-gray-500">Total invested amount</span>
            </div>
          </div>

          <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Commissions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(stats?.totalCommissions || user?.totalCommissions || 0).toLocaleString()} ETB
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <Award className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              <span className="text-purple-600">From referral network</span>
            </div>
          </div>

          <div className={`p-6 border border-gray-200 shadow-sm rounded-xl ${(stats?.pendingUplineCredit || 0) > 0 ? 'bg-white' : 'bg-green-50'
            }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Upline Credit</p>
                <p className={`text-2xl font-bold ${(stats?.pendingUplineCredit || 0) > 0 ? 'text-red-900' : 'text-green-700'
                  }`}>
                  {(stats?.pendingUplineCredit || 0).toLocaleString()} ETB
                </p>
              </div>
              {(stats?.pendingUplineCredit || 0) > 0 ? (
                <button
                  onClick={() => {
                    setPaymentAmount(String(stats?.pendingUplineCredit || 0));
                    if (merchantAccounts.length) {
                      setSelectedMerchantAccountId(merchantAccounts[0]._id);
                      setPaymentMethod(merchantAccounts[0].type);
                    }
                    setShowUplinePaymentModal(true);
                  }}
                  className="p-3 transition-colors bg-red-100 rounded-full hover:bg-red-200"
                  title="Click to submit upline credit payment"
                >
                  <CreditCard className="w-6 h-6 text-red-600" />
                </button>
              ) : (
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              )}
            </div>
            <div className="flex items-center mt-4 text-sm">
              <span className={`${(stats?.pendingUplineCredit || 0) > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                {(stats?.pendingUplineCredit || 0) > 0
                  ? 'Click card to submit manual payment'
                  : 'Credit cleared. Video rewards and daily returns are now active.'}
              </span>
            </div>
          </div>

          <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Team Size</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.totalTeamSize || user?.totalTeamSize || 0}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              <span className="text-gray-500">
                {stats?.directReferrals || user?.directReferrals || 0} direct referrals
              </span>
            </div>
          </div>
        </div>

        {(stats?.pendingUplineCredit || 0) > 0 ? (
          <div className="p-6 mb-8 text-sm text-orange-800 border border-orange-200 bg-orange-50 rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-orange-900">Pending upline credit</p>
                <p className="mt-1 text-gray-700">
                  You currently owe {(stats?.pendingUplineCredit || 0).toLocaleString()} ETB in upline credit. Click the credit card icon to submit a manual payment with receipt for approval by your upline parent.
                </p>
              </div>
              <span className="px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase bg-orange-600 rounded-full">
                Manual payment required
              </span>
            </div>
          </div>
        ) : (
          <div className="p-6 mb-8 text-sm text-green-800 border border-green-200 bg-green-50 rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-green-900">Credit cleared</p>
                <p className="mt-1 text-gray-700">
                  Your pending credit is cleared. You can now earn video rewards and daily returns normally.
                </p>
              </div>
              <span className="px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase bg-green-600 rounded-full">
                Rewards active
              </span>
            </div>
          </div>
        )}

        {pendingTransfers.length > 0 && (
          <div className="p-6 mb-8 bg-white border border-gray-200 shadow-sm rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Pending Credit Approvals</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Review and approve credit transfers that are waiting for your action.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {pendingTransfers.map((transfer) => (
                <div key={transfer._id} className="p-4 border border-gray-200 rounded-xl bg-gray-50">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-gray-500">From</p>
                      <p className="font-semibold text-gray-900">{transfer.fromUser.fullName}</p>
                      <p className="text-sm text-gray-500">{transfer.fromUser.username || ''}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Amount</p>
                      <p className="text-lg font-semibold text-green-700">{transfer.amount?.toLocaleString()} ETB</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <p className="text-sm font-semibold text-yellow-700">{transfer.approvalStatus}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        disabled={approvalProcessing === transfer._id}
                        onClick={() => handleApproveCredit(transfer._id)}
                        className="px-4 py-2 text-white rounded-lg bg-primary-600 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {approvalProcessing === transfer._id ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectForm((prev) => ({ ...prev, [transfer._id]: !prev[transfer._id] }))}
                        className="px-4 py-2 bg-white border rounded-lg text-primary-700 border-primary-600 hover:bg-primary-50"
                      >
                        {showRejectForm[transfer._id] ? 'Cancel' : 'Reject'}
                      </button>
                    </div>

                    {showRejectForm[transfer._id] && (
                      <div className="space-y-3">
                        <textarea
                          value={rejectionReason[transfer._id] || ''}
                          onChange={(event) =>
                            setRejectionReason((prev) => ({
                              ...prev,
                              [transfer._id]: event.target.value,
                            }))
                          }
                          className="w-full p-3 border border-gray-300 rounded-lg focus:border-primary-500 focus:outline-none"
                          placeholder="Enter rejection reason"
                          rows={3}
                        />
                        <button
                          disabled={approvalProcessing === transfer._id}
                          onClick={() => handleRejectCredit(transfer._id)}
                          className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {approvalProcessing === transfer._id ? 'Processing...' : 'Submit Rejection'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Referral Section */}
          <div className="lg:col-span-1">
            <div className="p-6 mb-6 bg-white border border-gray-200 shadow-sm rounded-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Referral Program</h3>

              <div className="space-y-4">
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Your Referral Code
                  </label>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                      <span className="font-mono text-lg font-semibold text-primary-600">
                        {showReferralCode ? user?.referralCode : '••••••••'}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowReferralCode(!showReferralCode)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      onClick={copyReferralCode}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      {copied ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => referralLink && copyTextFallback(referralLink)}
                  className="w-full px-4 py-2 text-white transition-colors rounded-lg bg-primary-600 hover:bg-primary-700"
                >
                  {copied ? 'Link Copied!' : 'Copy Referral Link'}
                </button>

                <div className="p-4 rounded-lg bg-gradient-to-r from-gold-50 to-gold-100">
                  <h4 className="mb-2 font-semibold text-gold-800">Commission Structure</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gold-700">Level 1:</span>
                      <span className="font-semibold text-gold-800">8%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gold-700">Level 2:</span>
                      <span className="font-semibold text-gold-800">4%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gold-700">Level 3:</span>
                      <span className="font-semibold text-gold-800">2%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gold-700">Level 4:</span>
                      <span className="font-semibold text-gold-800">1%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Merchant Accounts */}
            <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Payment Accounts</h3>

              <div className="space-y-4">
                {merchantAccounts.map((account) => (
                  <div key={account._id} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {account.type === 'bank' ? (
                          <CreditCard className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Smartphone className="w-5 h-5 text-green-600" />
                        )}
                        <h4 className="font-semibold text-gray-900">{account.name}</h4>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Account:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono">{account.accountNumber}</span>
                          <button
                            onClick={() => copyText(account.accountNumber)}
                            className="text-primary-600 hover:text-primary-700"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Name:</span>
                        <span>{account.accountName}</span>
                      </div>
                      {account.bankName && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Bank:</span>
                          <span>{account.bankName}</span>
                        </div>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="lg:col-span-2">
            <div className="p-6 bg-white border border-gray-200 shadow-sm rounded-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Recent Transactions</h3>

              {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
                <div className="space-y-4">
                  <div>Test transaction</div>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-gray-500">No transactions yet</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Make your first deposit to start earning
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upline Payment Modal */}
        {showUplinePaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-2xl p-6 mx-4 bg-white rounded-lg shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Submit Upline Credit Payment</h3>
                <button
                  onClick={() => setShowUplinePaymentModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  ×
                </button>
              </div>

              <div className="space-y-6">
                {/* Credit Amount */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Credit Amount (ETB) *
                  </label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Pending amount: {(stats?.pendingUplineCredit || 0).toLocaleString()} ETB
                  </p>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Payment Account *
                  </label>
                  <select
                    value={selectedMerchantAccountId}
                    onChange={(e) => {
                      setSelectedMerchantAccountId(e.target.value);
                      const selected = merchantAccounts.find(acc => acc._id === e.target.value);
                      if (selected) setPaymentMethod(selected.type);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    {merchantAccounts.map((account) => (
                      <option key={account._id} value={account._id}>
                        {account.name} - {account.accountNumber}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Account Details */}
                {selectedMerchantAccountId && merchantAccounts.find(a => a._id === selectedMerchantAccountId) && (
                  <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
                    {(() => {
                      const account = merchantAccounts.find(a => a._id === selectedMerchantAccountId);
                      return (
                        <div className="space-y-2 text-sm">
                          <div><span className="font-semibold text-gray-700">Account Name:</span> {account?.accountName}</div>
                          <div><span className="font-semibold text-gray-700">Account Number:</span> {account?.accountNumber}</div>
                          {account?.bankName && <div><span className="font-semibold text-gray-700">Bank:</span> {account.bankName}</div>}
                          {account?.instructions && <div><span className="font-semibold text-gray-700">Instructions:</span> {account.instructions}</div>}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Transaction Reference */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Transaction Reference *
                  </label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, reference: e.target.value }))}
                    placeholder="Enter transaction reference / receipt number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Must match your bank/transfer reference
                  </p>
                </div>

                {/* Receipt Upload */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Upload Receipt Image *
                  </label>
                  <div className="p-6 text-center transition-colors border-2 border-gray-300 border-dashed rounded-lg hover:border-primary-500 hover:bg-primary-50">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="receipt-upload"
                    />
                    <label htmlFor="receipt-upload" className="cursor-pointer">
                      <div className="font-medium text-primary-600">
                        {receiptFile ? receiptFile.name : 'Click to upload or drag and drop'}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        PNG, JPG, GIF or PDF (Max 10MB)
                      </p>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setShowUplinePaymentModal(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitUplinePayment}
                  disabled={submittingPayment}
                  className="flex-1 px-4 py-2 text-white border border-transparent rounded-md bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingPayment ? 'Submitting...' : 'Submit Payment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

