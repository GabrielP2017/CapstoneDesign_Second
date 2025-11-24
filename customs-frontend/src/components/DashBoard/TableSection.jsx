import React, { useState } from "react";
import {
  MoreHorizontal,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import PopularProducts from "./PopularProducts";

const initialOrders = [
  {
    id: "#3847",
    customer: "이동민",
    product: "맥북 16 프로",
    amount: "$2,399",
    status: "처리 완료",
    date: "2024-01-15",
  },
  {
    id: "#3848",
    customer: "이강민",
    product: "아이폰 16 프로",
    amount: "$1,199",
    status: "처리 중",
    date: "2024-01-15",
  },
  {
    id: "#3849",
    customer: "이승엽",
    product: "맥북 16 에어",
    amount: "$2,099",
    status: "처리 완료",
    date: "2024-01-15",
  },
  {
    id: "#3850",
    customer: "심민우",
    product: "로 지스맨",
    amount: "$11,399",
    status: "주문 취소",
    date: "2024-01-15",
  },
];

function TableSection() {
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "ascending",
  });
  const [orders, setOrders] = useState(initialOrders);

  const getStatusColor = (status) => {
    switch (status) {
      case "처리 완료":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "처리 중":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
      case "주문 취소":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
    }
  };

  const sortTable = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });

    const sortedOrders = [...orders].sort((a, b) => {
      if (a[key] < b[key]) {
        return direction === "ascending" ? -1 : 1;
      }
      if (a[key] > b[key]) {
        return direction === "ascending" ? 1 : -1;
      }
      return 0;
    });

    setOrders(sortedOrders);
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === "ascending" ? (
      <ChevronUp className="w-4 h-4 ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 ml-1" />
    );
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">
              최근 목록
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              최근 30일 간의 주문 내역
            </p>
          </div>
          <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            전체 보기
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead>
            <tr>
              <th className="p-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">
                <button
                  onClick={() => sortTable("id")}
                  className="flex items-center"
                >
                  ID {getSortIcon("id")}
                </button>
              </th>
              <th className="p-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">
                <button
                  onClick={() => sortTable("product")}
                  className="flex items-center"
                >
                  상품 {getSortIcon("product")}
                </button>
              </th>
              <th className="p-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">
                <button
                  onClick={() => sortTable("customer")}
                  className="flex items-center"
                >
                  고객 {getSortIcon("customer")}
                </button>
              </th>
              <th className="p-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">
                <button
                  onClick={() => sortTable("amount")}
                  className="flex items-center"
                >
                  가격 {getSortIcon("amount")}
                </button>
              </th>
              <th className="p-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">
                <button
                  onClick={() => sortTable("status")}
                  className="flex items-center"
                >
                  상태 {getSortIcon("status")}
                </button>
              </th>
              <th className="p-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">
                <button
                  onClick={() => sortTable("date")}
                  className="flex items-center"
                >
                  날짜 {getSortIcon("date")}
                </button>
              </th>
              <th className="p-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/50 dark:divide-slate-700/50">
            {orders.length > 0 ? (
              orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="p-4 text-sm font-medium text-blue-600 dark:text-blue-400">
                    {order.id}
                  </td>
                  <td className="p-4 text-sm text-slate-800 dark:text-white">
                    {order.product}
                  </td>
                  <td className="p-4 text-sm text-slate-800 dark:text-white">
                    {order.customer}
                  </td>
                  <td className="p-4 text-sm text-slate-800 dark:text-white">
                    {order.amount}
                  </td>
                  <td className="p-4">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-800 dark:text-white">
                    {order.date}
                  </td>
                  <td className="p-4 text-right">
                    <MoreHorizontal className="w-4 h-4 text-slate-400" />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="7"
                  className="p-4 text-center text-slate-500 dark:text-slate-400"
                >
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Popular Products section */}
      <div className="p-6 border-t border-slate-200/50 dark:border-slate-700/50">
        {/* Popular Products section을 컴포넌트로 대체 */}
        <PopularProducts />
      </div>
    </div>
  );
}

export default TableSection;
