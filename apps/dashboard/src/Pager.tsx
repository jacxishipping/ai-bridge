import React from "react";
import { JXPagination } from "@jacxishippingorg/jx-ui-react";

/**
 * Shared table pagination using JXUI JXPagination.
 */
export const Pager: React.FC<{
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}> = ({ total, page, pageSize, onPage }) => {
  if (total <= pageSize) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <JXPagination
        totalItems={total}
        page={page + 1}
        rowsPerPage={pageSize}
        onPageChange={(p) => onPage(Math.max(0, p - 1))}
      />
    </div>
  );
};
