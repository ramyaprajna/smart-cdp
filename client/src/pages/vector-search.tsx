import { memo } from "react";
import Header from "@/components/layout/header";
import VectorSearchPanel from "@/components/vector-search/search-panel";

const VectorSearch = memo(function VectorSearch() {
  return (
    <>
      <Header
        title="Vector Similarity Search"
        subtitle="Find similar customers using advanced vector embeddings and semantic search"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <VectorSearchPanel />
      </main>
    </>
  );
});

export default VectorSearch;
