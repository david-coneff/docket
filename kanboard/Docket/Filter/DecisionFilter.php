<?php

namespace Kanboard\Plugin\Docket\Filter;

use Kanboard\Core\Filter\FilterInterface;
use Kanboard\Filter\BaseFilter;
use Kanboard\Plugin\Docket\Model\DecisionModel;
use Kanboard\Model\TaskModel;
use PicoDb\Database;

/**
 * `decision:pending` (or `decision:ruled`) in the board's search: Kanboard has no filter on
 * task metadata, and the inbox marker is `rhiz_decision` (docs/kanboard-docket-design.md 3.3).
 */
class DecisionFilter extends BaseFilter implements FilterInterface
{
    private $db;

    public function getAttributes()
    {
        return array('decision');
    }

    public function setDatabase(Database $db)
    {
        $this->db = $db;
        return $this;
    }

    public function apply()
    {
        $this->query->inSubquery(TaskModel::TABLE.'.id', $this->db
            ->table(DecisionModel::META_TABLE)
            ->columns(DecisionModel::META_TABLE.'.task_id')
            ->eq('name', 'rhiz_decision')
            ->eq('value', strtolower((string) $this->value)));
        return $this;
    }
}
